"""
src/clinical/rules.py
Bộ luật và tiêu chuẩn dinh dưỡng lâm sàng chuyên sâu cho bệnh mạn tính:
- DIABETES (Đái tháo đường & Tiền đái tháo đường)
- HYPERTENSION (Tăng huyết áp & Tim mạch)
- GOUT (Bệnh Gút & Tăng Acid Uric)
- CKD_NON_DIALYSIS (Bệnh thận mạn giai đoạn 3-5 chưa lọc máu - Ăn giảm đạm bảo tồn thận)
- CKD_DIALYSIS (Bệnh thận mạn giai đoạn 5D đang lọc máu chu kỳ - Ăn tăng đạm bù đắp thất thoát)
- DYSLIPIDEMIA (Rối loạn Lipid máu & Gan nhiễm mỡ)

Toàn bộ ngưỡng định lượng được trung tâm hoá trong src/core/constants.py.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pandas as pd

from src.core.constants import (
    CHRONIC_CONDITIONS,
    DEFAULT_CONDITIONS,
    DISH_THRESHOLDS,
    HIGH_PURINE_KEYWORDS,
    INGREDIENT_THRESHOLDS,
    LEGACY_CONDITION_ALIASES,
    SWEET_DISH_KEYWORDS,
    SafetyStatus,
)

__all__ = [
    "CHRONIC_CONDITIONS",
    "SWEET_DISH_KEYWORDS",
    "HIGH_PURINE_KEYWORDS",
    "ChronicDiseaseEvaluator",
]

Evaluation = dict[str, Any]
ConditionResult = dict[str, Any]


def _get_val(row: Any, col: str) -> float | None:
    """Trích xuất giá trị số an toàn, trả về None nếu khuyết dữ liệu (NaN/None)."""
    if col not in row:
        return None
    val = row[col]
    if pd.isna(val) or val is None:
        return None
    try:
        return float(val)
    except (ValueError, TypeError):
        return None


def _has_keyword(name_lower: str, keywords: list[str]) -> bool:
    return any(kw in name_lower for kw in keywords)


def normalize_conditions(conditions: list[str] | None) -> list[str]:
    """Chuẩn hoá danh sách bệnh: ánh xạ mã cũ (CKD) và dùng danh sách mặc định nếu rỗng."""
    if not conditions:
        return list(DEFAULT_CONDITIONS)
    return [LEGACY_CONDITION_ALIASES.get(c, c) for c in conditions]


def aggregate_overall_status(results: dict[str, ConditionResult]) -> str:
    """Tổng hợp mức độ nghiêm trọng: AVOID > MODERATE > SAFE."""
    statuses = {v.get("status") for v in results.values()}
    if SafetyStatus.AVOID in statuses:
        return SafetyStatus.AVOID
    if SafetyStatus.MODERATE in statuses:
        return SafetyStatus.MODERATE
    return SafetyStatus.SAFE


class ChronicDiseaseEvaluator:
    """Bộ đánh giá độ an toàn thực phẩm theo bệnh mạn tính (stateless)."""

    # ── Các hàm đánh giá MÓN ĂN THÀNH PHẨM (theo suất) ────────────────────────

    @staticmethod
    def _diabetes_dish(dish_row: Any, food_name: str) -> ConditionResult:
        t = DISH_THRESHOLDS["DIABETES"]
        carb = _get_val(dish_row, "carbohydrate_g")
        fiber = _get_val(dish_row, "fiber_g")

        reasons: list[str] = []
        status = SafetyStatus.SAFE
        is_sweet = _has_keyword(food_name, SWEET_DISH_KEYWORDS)

        if is_sweet:
            status = SafetyStatus.AVOID
            reasons.append(
                "Món ngọt / Chè / Tráng miệng chứa đường đơn tự do (Sucrose/Glucose/Fructose) "
                "với chỉ số đường huyết (GI) rất cao, dễ gây tăng vọt đường huyết sau ăn."
            )
        elif carb is None:
            status = SafetyStatus.MODERATE
            reasons.append(
                "⚠️ Chưa có dữ liệu định lượng Carbohydrate. Người bệnh Đái tháo đường nên "
                "kiểm tra thành phần tinh bột trước khi dùng."
            )
        elif carb > t["CARB_AVOID"] or (carb > t["CARB_AVOID_LOW_FIBER"] and (fiber is None or fiber < t["FIBER_MIN"])):
            status = SafetyStatus.AVOID
            fiber_str = f"{fiber:.1f}g" if fiber is not None else "chưa xác định"
            reasons.append(
                f"Carbohydrate rất cao ({carb:.1f}g) trong khi ít chất xơ ({fiber_str}), "
                "nguy cơ tăng nhanh đường huyết sau ăn."
            )
        elif carb > t["CARB_MODERATE"]:
            status = SafetyStatus.MODERATE
            reasons.append(
                f"Carbohydrate mức trung bình ({carb:.1f}g). Khuyến cáo giảm bớt khẩu phần "
                "tinh bột, ăn kèm nhiều rau xanh để làm chậm hấp thu."
            )
        else:
            fiber_str = f" (Chất xơ: {fiber:.1f}g)" if fiber is not None else ""
            reasons.append(
                f"Lượng Carbohydrate an toàn ({carb:.1f}g){fiber_str}, phù hợp duy trì ổn định đường huyết."
            )

        return {"status": status, "reasons": reasons}

    @staticmethod
    def _hypertension_dish(dish_row: Any, food_name: str) -> ConditionResult:
        t = DISH_THRESHOLDS["HYPERTENSION"]
        na = _get_val(dish_row, "sodium_mg")

        reasons = []
        status = SafetyStatus.SAFE

        if na is None:
            status = SafetyStatus.MODERATE
            reasons.append(
                "⚠️ Chưa có dữ liệu định lượng Natri cho món này. Người bệnh Tăng huyết áp cần "
                "chú ý không nêm thêm muối, nước mắm."
            )
        elif na > t["SODIUM_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(
                f"Hàm lượng Natri rất cao ({na:.1f}mg/suất, chiếm >50% mức tối đa cả ngày). "
                "Cần hạn chế húp nước dùng, nước sốt."
            )
        elif na > t["SODIUM_MODERATE"]:
            status = SafetyStatus.MODERATE
            reasons.append(f"Natri mức trung bình ({na:.1f}mg). Nên giảm bớt nước chấm, gia vị nêm nếm.")
        else:
            reasons.append(f"Hàm lượng Natri an toàn ({na:.1f}mg/suất), thân thiện với huyết áp và tim mạch.")

        return {"status": status, "reasons": reasons}

    @staticmethod
    def _gout_dish(dish_row: Any, food_name: str) -> ConditionResult:
        t = DISH_THRESHOLDS["GOUT"]
        prot = _get_val(dish_row, "protein_g")
        has_high_purine_food = _has_keyword(food_name, HIGH_PURINE_KEYWORDS)

        reasons = []
        status = SafetyStatus.SAFE

        if has_high_purine_food:
            status = SafetyStatus.AVOID
            reasons.append(
                "Chứa nguyên liệu giàu nhân Purine (nội tạng động vật, ốc, hải sản), "
                "nguy cơ cao kích hoạt cơn Gout cấp."
            )
        elif prot is not None and prot > t["PROTEIN_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(
                f"Lượng đạm rất cao ({prot:.1f}g/suất), làm gia tăng tổng lượng purine "
                "chuyển hóa thành Acid Uric."
            )
        elif prot is not None and prot > t["PROTEIN_MODERATE"]:
            status = SafetyStatus.MODERATE
            reasons.append(
                f"Lượng đạm trung bình ({prot:.1f}g). Người bệnh Gout có thể dùng với khẩu phần "
                "vừa phải và uống nhiều nước."
            )
        elif prot is None:
            status = SafetyStatus.MODERATE
            reasons.append("⚠️ Chưa rõ hàm lượng đạm. Khuyến cáo dùng lượng vừa phải.")
        else:
            reasons.append(f"Lượng đạm thấp ({prot:.1f}g), an toàn cho người bệnh Gout.")

        return {"status": status, "reasons": reasons}

    @staticmethod
    def _ckd_non_dialysis_dish(dish_row: Any, food_name: str) -> ConditionResult:
        t = DISH_THRESHOLDS["CKD_NON_DIALYSIS"]
        prot = _get_val(dish_row, "protein_g")
        k = _get_val(dish_row, "potassium_mg")
        na = _get_val(dish_row, "sodium_mg")

        reasons = []
        status = SafetyStatus.SAFE

        if prot is not None and prot > t["PROTEIN_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(
                f"Đạm cao ({prot:.1f}g/suất). BN suy thận chưa lọc máu cần ăn giảm đạm "
                "(0.6-0.8g/kg/ngày) để tránh tăng urê máu."
            )
        elif k is not None and k > t["POTASSIUM_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(f"Kali rất cao ({k:.1f}mg/suất), nguy cơ tăng Kali máu nguy hiểm ở người suy thận.")
        elif na is not None and na > t["SODIUM_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(f"Natri cao ({na:.1f}mg), gây ứ nước, phù và tăng huyết áp trên nền suy thận.")
        elif (
            (prot is not None and prot > t["PROTEIN_MODERATE"])
            or (k is not None and k > t["POTASSIUM_MODERATE"])
            or (na is not None and na > t["SODIUM_MODERATE"])
        ):
            status = SafetyStatus.MODERATE
            p_str = f"Đạm: {prot:.1f}g" if prot is not None else ""
            k_str = f"Kali: {k:.1f}mg" if k is not None else ""
            reasons.append(f"Cần kiểm soát khẩu phần ({p_str}, {k_str}). Tính toán trong tổng hạn mức đạm/ngày.")
        elif prot is None and k is None:
            status = SafetyStatus.MODERATE
            reasons.append("⚠️ Thiếu chỉ số Đạm và Kali để đánh giá chính xác gánh nặng lọc thận.")
        else:
            reasons.append("Đạm, Kali và Natri ở ngưỡng thấp, an toàn cho chế độ bảo tồn chức năng thận.")

        return {"status": status, "reasons": reasons}

    @staticmethod
    def _ckd_dialysis_dish(dish_row: Any, food_name: str) -> ConditionResult:
        t = DISH_THRESHOLDS["CKD_DIALYSIS"]
        prot = _get_val(dish_row, "protein_g")
        k = _get_val(dish_row, "potassium_mg")
        na = _get_val(dish_row, "sodium_mg")

        reasons = []
        status = SafetyStatus.SAFE

        if k is not None and k > t["POTASSIUM_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(
                f"Kali cao ({k:.1f}mg/suất). Người chạy thận phải kiểm soát rất chặt Kali giữa "
                "2 kỳ lọc để phòng rối loạn nhịp tim."
            )
        elif na is not None and na > t["SODIUM_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(f"Natri cao ({na:.1f}mg), dễ gây khát nước, tăng cân nhanh giữa 2 lần lọc máu.")
        elif prot is not None and prot < t["PROTEIN_MIN"]:
            status = SafetyStatus.MODERATE
            reasons.append(
                f"Lượng đạm thấp ({prot:.1f}g). Người chạy thận cần ăn tăng đạm (1.2-1.4g/kg/ngày) "
                "để bù đắp protein mất qua màng lọc."
            )
        elif (k is not None and k > t["POTASSIUM_MODERATE"]) or (na is not None and na > t["SODIUM_MODERATE"]):
            status = SafetyStatus.MODERATE
            reasons.append("Lượng Kali/Natri ở mức trung bình, cần cân đối với tổng lượng dịch và điện giải trong ngày.")
        else:
            reasons.append("Cung cấp đạm tốt và kiểm soát an toàn Kali/Natri cho người chạy thận nhân tạo.")

        return {"status": status, "reasons": reasons}

    @staticmethod
    def _dyslipidemia_dish(dish_row: Any, food_name: str) -> ConditionResult:
        t = DISH_THRESHOLDS["DYSLIPIDEMIA"]
        chol = _get_val(dish_row, "cholesterol_mg")
        fat = _get_val(dish_row, "fat_g")
        is_sweet = _has_keyword(food_name, SWEET_DISH_KEYWORDS)

        reasons = []
        status = SafetyStatus.SAFE

        if chol is not None and chol > t["CHOLESTEROL_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(
                f"Cholesterol cao ({chol:.1f}mg/suất), vượt ngưỡng khuyến cáo cho người mỡ máu cao / xơ vữa động mạch."
            )
        elif fat is not None and fat > t["FAT_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(f"Hàm lượng chất béo tổng cao ({fat:.1f}g/suất). Cần giảm bớt đồ chiên rán, mỡ động vật.")
        elif is_sweet:
            status = SafetyStatus.MODERATE
            reasons.append(
                "Chứa đường ngọt tự do, đường dư thừa sẽ chuyển hóa thành Triglyceride tích tụ trong máu và gan."
            )
        elif (chol is not None and chol > t["CHOLESTEROL_MODERATE"]) or (fat is not None and fat > t["FAT_MODERATE"]):
            status = SafetyStatus.MODERATE
            reasons.append(
                f"Cholesterol ({chol or 0:.1f}mg) hoặc Chất béo ({fat or 0:.1f}g) ở mức trung bình. "
                "Khuyến nghị giảm bớt mỡ, dầu chiên xào."
            )
        elif chol is None and fat is None:
            status = SafetyStatus.MODERATE
            reasons.append("⚠️ Chưa có số liệu chất béo và cholesterol.")
        else:
            reasons.append("Cholesterol và chất béo thấp, rất tốt cho sức khỏe tim mạch và kiểm soát mỡ máu.")

        return {"status": status, "reasons": reasons}

    # ── Các hàm đánh giá NGUYÊN LIỆU THÔ (theo 100g) ──────────────────────────

    @staticmethod
    def _diabetes_ingredient(ing_row: Any, ing_name: str, category: str) -> ConditionResult:
        t = INGREDIENT_THRESHOLDS["DIABETES"]
        carb = _get_val(ing_row, "carb_g")
        fiber = _get_val(ing_row, "fiber_g")
        sugars = (
            (_get_val(ing_row, "fructose_g") or 0)
            + (_get_val(ing_row, "glucose_g") or 0)
            + (_get_val(ing_row, "sucrose_g") or 0)
        )

        reasons = []
        status = SafetyStatus.SAFE
        if sugars > t["SUGARS_AVOID"] or "đồ ngọt" in category or (
            carb is not None and carb > t["CARB_AVOID"] and (fiber is None or fiber < t["FIBER_MIN"])
        ):
            status = SafetyStatus.AVOID
            reasons.append(
                f"Giàu đường đơn/tinh bột tinh chế ({carb or 0:.1f}g carb, {sugars:.1f}g đường/100g), "
                "nguy cơ tăng nhanh đường huyết."
            )
        elif (carb is not None and carb > t["CARB_MODERATE"]) or sugars > t["SUGARS_MODERATE"]:
            status = SafetyStatus.MODERATE
            reasons.append(f"Lượng đường bột trung bình ({carb or 0:.1f}g/100g). Cần kiểm soát lượng gam ăn vào.")
        elif carb is None:
            status = SafetyStatus.MODERATE
            reasons.append("⚠️ Chưa có dữ liệu Carbohydrate.")
        else:
            reasons.append(f"Lượng carb thấp ({carb or 0:.1f}g/100g), an toàn cho đường huyết.")
        return {"status": status, "reasons": reasons}

    @staticmethod
    def _hypertension_ingredient(ing_row: Any, ing_name: str, category: str) -> ConditionResult:
        t = INGREDIENT_THRESHOLDS["HYPERTENSION"]
        na = _get_val(ing_row, "sodium_mg")
        reasons = []
        status = SafetyStatus.SAFE
        if na is not None and na > t["SODIUM_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(f"Chứa hàm lượng Natri tự nhiên/ướp mặn rất cao ({na:.1f}mg/100g).")
        elif na is not None and na > t["SODIUM_MODERATE"]:
            status = SafetyStatus.MODERATE
            reasons.append(f"Natri mức trung bình ({na:.1f}mg/100g).")
        elif na is None:
            status = SafetyStatus.MODERATE
            reasons.append("⚠️ Chưa có dữ liệu định lượng Natri.")
        else:
            reasons.append(f"Natri thấp ({na:.1f}mg/100g), an toàn cho huyết áp.")
        return {"status": status, "reasons": reasons}

    @staticmethod
    def _gout_ingredient(ing_row: Any, ing_name: str, category: str) -> ConditionResult:
        t = INGREDIENT_THRESHOLDS["GOUT"]
        purine = _get_val(ing_row, "purine_mg")
        reasons = []
        status = SafetyStatus.SAFE
        if purine is not None and purine >= t["PURINE_AVOID"]:
            status = SafetyStatus.AVOID
            reasons.append(f"Thuộc nhóm thực phẩm Purine cao ({purine:.1f}mg/100g >= 150mg). Chống chỉ định cho bệnh nhân Gout.")
        elif purine is not None and purine >= t["PURINE_MODERATE"]:
            status = SafetyStatus.MODERATE
            reasons.append(f"Purine mức vừa ({purine:.1f}mg/100g). Khuyến cáo dùng dưới 100g/bữa.")
        elif _has_keyword(ing_name, HIGH_PURINE_KEYWORDS) or "thịt" in category or "thủy sản" in category:
            status = SafetyStatus.MODERATE
            reasons.append("Thực phẩm giàu đạm động vật, cần giới hạn khẩu phần dưới 100g/bữa.")
        else:
            p_str = f"Purine: {purine:.1f}mg" if purine is not None else "Purine thấp"
            reasons.append(f"Thực phẩm an toàn cho bệnh nhân Gout ({p_str}).")
        return {"status": status, "reasons": reasons}

    @staticmethod
    def _ckd_non_dialysis_ingredient(ing_row: Any, ing_name: str, category: str) -> ConditionResult:
        t = INGREDIENT_THRESHOLDS["CKD_NON_DIALYSIS"]
        prot = _get_val(ing_row, "protein_g")
        k = _get_val(ing_row, "potassium_mg")
        p = _get_val(ing_row, "phosphorus_mg")
        reasons = []
        status = SafetyStatus.SAFE
        if (k is not None and k > t["POTASSIUM_AVOID"]) or (p is not None and p > t["PHOSPHORUS_AVOID"]):
            status = SafetyStatus.AVOID
            reasons.append(f"Giàu Kali ({k or 0:.1f}mg) hoặc Phốt pho ({p or 0:.1f}mg/100g), thận suy khó đào thải.")
        elif (
            (prot is not None and prot > t["PROTEIN_MODERATE"])
            or (k is not None and k > t["POTASSIUM_MODERATE"])
            or (p is not None and p > t["PHOSPHORUS_MODERATE"])
        ):
            status = SafetyStatus.MODERATE
            reasons.append("Đạm và khoáng chất ở mức vừa, cần tính toán trong thực đơn bệnh thận.")
        else:
            reasons.append("Hàm lượng Kali, Phốt pho và Đạm thấp, an toàn bảo tồn thận.")
        return {"status": status, "reasons": reasons}

    @staticmethod
    def _ckd_dialysis_ingredient(ing_row: Any, ing_name: str, category: str) -> ConditionResult:
        t = INGREDIENT_THRESHOLDS["CKD_DIALYSIS"]
        prot = _get_val(ing_row, "protein_g")
        k = _get_val(ing_row, "potassium_mg")
        p = _get_val(ing_row, "phosphorus_mg")
        reasons = []
        status = SafetyStatus.SAFE
        if (k is not None and k > t["POTASSIUM_AVOID"]) or (p is not None and p > t["PHOSPHORUS_AVOID"]):
            status = SafetyStatus.AVOID
            reasons.append(f"Kali ({k or 0:.1f}mg) hoặc Phốt pho ({p or 0:.1f}mg/100g) vượt mức an toàn cho người chạy thận.")
        elif prot is not None and prot >= t["PROTEIN_GOOD"]:
            status = SafetyStatus.SAFE
            reasons.append(f"Giàu đạm ({prot:.1f}g/100g), rất tốt để bồi phụ dinh dưỡng cho người lọc máu.")
        else:
            reasons.append("Khoáng chất an toàn cho người chạy thận.")
        return {"status": status, "reasons": reasons}

    @staticmethod
    def _dyslipidemia_ingredient(ing_row: Any, ing_name: str, category: str) -> ConditionResult:
        t = INGREDIENT_THRESHOLDS["DYSLIPIDEMIA"]
        chol = _get_val(ing_row, "cholesterol_mg")
        fat = _get_val(ing_row, "fat_g")
        fructose = _get_val(ing_row, "fructose_g")
        reasons = []
        status = SafetyStatus.SAFE
        if (
            (chol is not None and chol > t["CHOLESTEROL_AVOID"])
            or (fat is not None and fat > t["FAT_AVOID"])
            or (fructose is not None and fructose > t["FRUCTOSE_AVOID"])
        ):
            status = SafetyStatus.AVOID
            reasons.append(f"Cholesterol cao ({chol or 0:.1f}mg) hoặc Chất béo/Fructose cao, bất lợi cho mỡ máu và gan.")
        elif (chol is not None and chol > t["CHOLESTEROL_MODERATE"]) or (fat is not None and fat > t["FAT_MODERATE"]):
            status = SafetyStatus.MODERATE
            reasons.append(f"Cholesterol ({chol or 0:.1f}mg) hoặc Chất béo ({fat or 0:.1f}g) ở mức vừa.")
        else:
            reasons.append("Ít béo và không chứa cholesterol xấu.")
        return {"status": status, "reasons": reasons}

    # ── Bảng điều phối: mã bệnh -> hàm đánh giá tương ứng ────────────────────

    _DISH_EVALUATORS: dict[str, Callable[[Any, str], ConditionResult]] = {
        "DIABETES": _diabetes_dish,
        "HYPERTENSION": _hypertension_dish,
        "GOUT": _gout_dish,
        "CKD_NON_DIALYSIS": _ckd_non_dialysis_dish,
        "CKD_DIALYSIS": _ckd_dialysis_dish,
        "DYSLIPIDEMIA": _dyslipidemia_dish,
    }

    _INGREDIENT_EVALUATORS: dict[str, Callable[[Any, str, str], ConditionResult]] = {
        "DIABETES": _diabetes_ingredient,
        "HYPERTENSION": _hypertension_ingredient,
        "GOUT": _gout_ingredient,
        "CKD_NON_DIALYSIS": _ckd_non_dialysis_ingredient,
        "CKD_DIALYSIS": _ckd_dialysis_ingredient,
        "DYSLIPIDEMIA": _dyslipidemia_ingredient,
    }

    @staticmethod
    def evaluate_dish(dish_row: Any, conditions: list[str] | None = None) -> Evaluation:
        """
        Đánh giá độ an toàn của 1 món ăn thành phẩm (Food_Node) đối với danh sách bệnh mạn tính.
        Trả về dict đánh giá cho từng bệnh và tổng kết: SAFE, MODERATE, AVOID.
        """
        mapped_conditions = normalize_conditions(conditions)
        food_name = str(dish_row.get("food_name", "")).strip().lower()

        results: dict[str, ConditionResult] = {}
        for cond in mapped_conditions:
            evaluator = ChronicDiseaseEvaluator._DISH_EVALUATORS.get(cond)
            if evaluator is not None:
                results[cond] = evaluator(dish_row, food_name)

        return {
            "overall_status": aggregate_overall_status(results),
            "details": results,
        }

    @staticmethod
    def evaluate_ingredient(ing_row: Any, conditions: list[str] | None = None) -> Evaluation:
        """
        Đánh giá độ an toàn của 1 nguyên liệu thực phẩm (vietnam_food_nutrition) theo 100g.
        """
        mapped_conditions = normalize_conditions(conditions)
        ing_name = str(ing_row.get("ingredient_name", "")).lower()
        category = str(ing_row.get("category", "")).lower()

        results: dict[str, ConditionResult] = {}
        for cond in mapped_conditions:
            evaluator = ChronicDiseaseEvaluator._INGREDIENT_EVALUATORS.get(cond)
            if evaluator is not None:
                results[cond] = evaluator(ing_row, ing_name, category)

        return {
            "overall_status": aggregate_overall_status(results),
            "details": results,
        }
