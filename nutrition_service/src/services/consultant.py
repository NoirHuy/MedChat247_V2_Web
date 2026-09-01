"""
src/services/consultant.py
Động cơ tư vấn & gợi ý thực đơn dinh dưỡng cá nhân hóa theo bệnh mạn tính.
Kết hợp bộ đánh giá lâm sàng (rules) và Real LLM (llm_client).
"""

from __future__ import annotations

import logging
import os
import re
from typing import Any

import pandas as pd

from src.clinical.rules import ChronicDiseaseEvaluator
from src.core.constants import CHRONIC_CONDITIONS, MAX_CHAT_HISTORY_TURNS, SafetyStatus
from src.database.food_repository import CsvFoodRepository, Neo4jFoodRepository
from src.database.neo4j_client import Neo4jClient
from src.services.food_matcher import (
    FoodMatcher,
    categorize_dish,
    clean_dict,
    extract_conditions_from_text,
    is_meta_question,
    to_native,
)
from src.services.llm_client import LLMClient

logger = logging.getLogger(__name__)


def _annotate_condition_names(evaluation: dict[str, Any]) -> dict[str, Any]:
    """Gắn tên tiếng Việt cho từng bệnh trong evaluation — dùng bởi badge trên
    NutritionCard ('Đánh giá theo: ...') và ngữ cảnh LLM."""
    for cond, detail in (evaluation.get("details") or {}).items():
        d = dict(detail)
        info = CHRONIC_CONDITIONS.get(cond) or {}
        d["condition_name"] = info.get("name_vi", cond)
        evaluation["details"][cond] = d
    return evaluation

# Câu hỏi nối tiếp về món đã nhắc ở lượt trước: chỉ fallback vào history khi
# câu hiện tại mang dấu hiệu này — tránh "chào bạn"/"cảm ơn nhé!" bị gắn nhầm
# món cũ và sinh card sai ngữ cảnh.
_FOLLOWUP_CUE_RE = re.compile(
    r"(còn\b|nó\b|món (đó|này|kia)|thực phẩm (đó|này)|lượng (đó|này)"
    r"|khẩu phần (đó|này)|thì sao|vậy\b|nếu\b|bao nhiêu|tốt cho|xấu cho|hợp với|an toàn)"
)


def _is_food_followup(text: str) -> bool:
    """Nhận diện câu hỏi nối tiếp về món đã hỏi ở lượt trước."""
    t = (text or "").strip().lower()
    if not t or len(t) > 200:
        return False
    return bool(_FOLLOWUP_CUE_RE.search(t))

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
PROCESSED_DIR = os.path.join(BASE_DIR, "data", "processed")

# Repository dùng cho toàn bộ truy vấn dữ liệu: Neo4j (Cypher) là nguồn chính,
# CSV là fallback khi graph trống / không kết nối được.
FoodRepository = CsvFoodRepository | Neo4jFoodRepository


def create_food_repository(source: str = "auto") -> FoodRepository:
    """
    Tạo repository theo nguồn yêu cầu:
    - 'auto': thử Neo4j trước (graph phải có dữ liệu Food), lỗi/trống → CSV.
    - 'neo4j' / 'csv': ép nguồn cố định.
    """
    if source in ("auto", "neo4j"):
        try:
            client = Neo4jClient()
            repo = Neo4jFoodRepository(client)
            if repo.count_dishes() > 0:
                return repo
            logger.warning("Neo4j graph không có dữ liệu Food — fallback sang CSV.")
        except Exception as e:
            logger.warning("Không thể dùng Neo4j làm nguồn dữ liệu (%s) — fallback sang CSV.", e)
    return CsvFoodRepository(
        dishes_path=os.path.join(PROCESSED_DIR, "food_nodes_cleaned.csv"),
        rels_path=os.path.join(PROCESSED_DIR, "food_nutrient_rels_cleaned.csv"),
        ingredients_path=os.path.join(PROCESSED_DIR, "vietnam_food_nutrition_cleaned.csv"),
    )

__all__ = [
    "NutritionConsultant",
    "categorize_dish",
    "print_consultation_report",
]

# Nhãn hiển thị vi chất cho nguyên liệu (theo 100g)
INGREDIENT_NUTRIENT_LABELS = {
    "energy_kcal": ("Năng lượng", "kcal"),
    "protein_g": ("Chất đạm (Protein)", "g"),
    "fat_g": ("Chất béo (Lipid)", "g"),
    "carb_g": ("Chất bột đường (Carb)", "g"),
    "fiber_g": ("Chất xơ", "g"),
    "purine_mg": ("Nhân Purine", "mg"),
    "sodium_mg": ("Natri", "mg"),
    "potassium_mg": ("Kali", "mg"),
    "phosphorus_mg": ("Phốt pho", "mg"),
    "cholesterol_mg": ("Cholesterol", "mg"),
    "calcium_mg": ("Canxi", "mg"),
    "iron_mg": ("Sắt", "mg"),
    "vitamin_c_mg": ("Vitamin C", "mg"),
    "fructose_g": ("Đường Fructose", "g"),
    "glucose_g": ("Đường Glucose", "g"),
    "sucrose_g": ("Đường Sucrose", "g"),
    "water_g": ("Nước", "g"),
}


class NutritionConsultant:
    """
    Hệ thống tư vấn dinh dưỡng lâm sàng kết hợp Knowledge Graph và Real LLM.

    Nguồn dữ liệu do FoodRepository cung cấp: Neo4j (Cypher) là nguồn chính,
    tự fallback về CSV nếu graph trống hoặc không kết nối được.
    """

    def __init__(self, repository: FoodRepository | None = None, source: str = "auto"):
        self.repository = repository if repository is not None else create_food_repository(source)
        self.source = self.repository.source

        self.matcher = FoodMatcher(
            self.repository.dish_names, self.repository.ingredient_names
        )
        self.llm_client = LLMClient()
        logger.info("NutritionConsultant khởi tạo với nguồn dữ liệu: %s", self.source)

    # ── Tra cứu & tư vấn ──────────────────────────────────────────────────────

    def suggestion_items(self) -> list[str]:
        """Danh sách tên món + nguyên liệu cho autocomplete."""
        names = [orig for _lower, orig in self.repository.dish_names]
        names += [orig for _lower, orig in self.repository.ingredient_names]
        return sorted(set(names))

    def _match_dish(self, q_str: str) -> dict[str, Any] | None:
        """Ưu tiên khớp chính xác tuyệt đối, sau đó tìm kiếm chứa chuỗi con."""
        row = self.repository.get_dish(q_str)
        if row:
            return row
        rows = self.repository.find_dishes_by_substring(q_str)
        return rows[0] if rows else None

    def _match_ingredient(self, q_str: str) -> dict[str, Any] | None:
        row = self.repository.get_ingredient(q_str)
        if row:
            return row
        rows = self.repository.find_ingredients_by_substring(q_str)
        return rows[0] if rows else None

    def consult_dish(self, dish_query: str, conditions: list[str] | None = None) -> dict[str, Any]:
        """
        Tra cứu và tư vấn dinh dưỡng chi tiết cho 1 món ăn dựa trên danh sách bệnh lý của người dùng.
        """
        q_str = str(dish_query).strip()
        dish_row = self._match_dish(q_str)
        if not dish_row:
            return {"error": f"Không tìm thấy món ăn nào khớp với từ khóa '{dish_query}'."}

        evaluation = _annotate_condition_names(
            ChronicDiseaseEvaluator.evaluate_dish(dish_row, conditions)
        )

        fid = dish_row["food_id"]
        nutrients = self.repository.get_nutrient_details(fid)

        alternatives: list[dict[str, Any]] = []
        if evaluation["overall_status"] in (SafetyStatus.AVOID, SafetyStatus.MODERATE):
            alternatives = self.find_healthy_alternatives(dish_row, conditions)

        carb_val = to_native(dish_row.get("carbohydrate_g", dish_row.get("carb_g", None)))

        return clean_dict({
            "food_id": to_native(dish_row["food_id"]),
            "food_name": to_native(dish_row["food_name"]),
            "category": categorize_dish(dish_row["food_name"]),
            "energy_kcal": to_native(dish_row.get("energy_kcal", None)),
            "protein_g": to_native(dish_row.get("protein_g", None)),
            "fat_g": to_native(dish_row.get("fat_g", None)),
            # carbohydrate_g là tên chuẩn; carb_g giữ lại để tương thích ngược frontend cũ
            "carbohydrate_g": carb_val,
            "carb_g": carb_val,
            "fiber_g": to_native(dish_row.get("fiber_g", None)),
            "sodium_mg": to_native(dish_row.get("sodium_mg", None)),
            "potassium_mg": to_native(dish_row.get("potassium_mg", None)),
            "purine_mg": to_native(dish_row.get("purine_mg", None)),
            "cholesterol_mg": to_native(dish_row.get("cholesterol_mg", None)),
            "evaluation": evaluation,
            "alternatives": alternatives,
            "healthy_alternatives": alternatives,
            "all_nutrients": nutrients,
        })

    def consult_ingredient(self, ing_query: str, conditions: list[str] | None = None) -> dict[str, Any]:
        """
        Tra cứu và tư vấn dinh dưỡng cho 1 nguyên liệu thực phẩm (theo 100g).
        """
        q_str = str(ing_query).strip()
        ing_row = self._match_ingredient(q_str)
        if not ing_row:
            return {"error": f"Không tìm thấy nguyên liệu nào khớp với từ khóa '{ing_query}'."}

        evaluation = _annotate_condition_names(
            ChronicDiseaseEvaluator.evaluate_ingredient(ing_row, conditions)
        )

        all_nutrients = []
        for prop, (label, unit) in INGREDIENT_NUTRIENT_LABELS.items():
            if prop in ing_row and pd.notnull(ing_row[prop]):
                all_nutrients.append({
                    "nutrient_name": label,
                    "amount": float(ing_row[prop]),
                    "unit": unit,
                    "property_name": prop,
                })

        carb_val = to_native(ing_row.get("carb_g", ing_row.get("carbohydrate_g", None)))

        return clean_dict({
            "ingredient_id": to_native(ing_row["ingredient_id"]),
            "ingredient_name": to_native(ing_row["ingredient_name"]),
            "category": to_native(ing_row["category"]),
            "energy_kcal": to_native(ing_row.get("energy_kcal", None)),
            "protein_g": to_native(ing_row.get("protein_g", None)),
            "fat_g": to_native(ing_row.get("fat_g", None)),
            # carb_g là tên chuẩn của dataset nguyên liệu; giữ alias carbohydrate_g cho frontend
            "carb_g": carb_val,
            "carbohydrate_g": carb_val,
            "fiber_g": to_native(ing_row.get("fiber_g", None)),
            "purine_mg": to_native(ing_row.get("purine_mg", None)),
            "sodium_mg": to_native(ing_row.get("sodium_mg", None)),
            "potassium_mg": to_native(ing_row.get("potassium_mg", None)),
            "cholesterol_mg": to_native(ing_row.get("cholesterol_mg", None)),
            "evaluation": evaluation,
            "alternatives": [],
            "healthy_alternatives": [],
            "all_nutrients": all_nutrients,
        })

    def consult_any(self, query: str, conditions: list[str] | None = None) -> dict[str, Any]:
        """Tra cứu tổng quát: ưu tiên món ăn, nếu không tìm thấy thì tra nguyên liệu."""
        report = self.consult_dish(query, conditions=conditions)
        if "error" in report:
            report = self.consult_ingredient(query, conditions=conditions)
        return report

    def find_healthy_alternatives(
        self, target_dish: Any, conditions: list[str] | None = None, top_k: int = 3
    ) -> list[dict[str, Any]]:
        """
        Tìm món ăn thay thế an toàn: cùng phân nhóm (category), có status SAFE đối với bệnh của user.
        """
        target_name = target_dish["food_name"]
        category = categorize_dish(target_name)

        same_category: list[dict[str, Any]] = []
        other_category: list[dict[str, Any]] = []
        for row in self.repository.all_dishes():
            name = row.get("food_name")
            if not name or name == target_name:
                continue
            (same_category if categorize_dish(name) == category else other_category).append(row)
        candidates = same_category or other_category

        safe_alternatives: list[dict[str, Any]] = []
        for row in candidates:
            eval_res = ChronicDiseaseEvaluator.evaluate_dish(row, conditions)
            if eval_res["overall_status"] != SafetyStatus.SAFE:
                continue
            carb_v = to_native(row.get("carbohydrate_g", row.get("carb_g", None)))
            safe_alternatives.append({
                "food_id": to_native(row["food_id"]),
                "food_name": to_native(row["food_name"]),
                "energy_kcal": to_native(row.get("energy_kcal", None)),
                "sodium_mg": to_native(row.get("sodium_mg", None)),
                "carbohydrate_g": carb_v,
                "carb_g": carb_v,
                "protein_g": to_native(row.get("protein_g", None)),
                "fat_g": to_native(row.get("fat_g", None)),
                "reasons": [r for d in eval_res["details"].values() for r in d["reasons"]],
            })
            if len(safe_alternatives) >= top_k:
                break

        return safe_alternatives

    # ── Chat tự nhiên ─────────────────────────────────────────────────────────

    def extract_conditions_from_text(self, text: str) -> list[str]:
        """Trích xuất tự động các bệnh lý mạn tính từ câu thoại người dùng."""
        return extract_conditions_from_text(text)

    def find_food_in_text(self, text: str) -> dict[str, str] | None:
        """Tìm món ăn/nguyên liệu trong câu hỏi tự nhiên (ủy quyền cho FoodMatcher)."""
        return self.matcher.find_food_in_text(text)

    def _sanitize_history(self, history: Any) -> list[dict[str, str]]:
        """Làm sạch history gửi từ Node gateway: chỉ giữ user/assistant, giới hạn số lượt."""
        if not isinstance(history, list):
            return []
        sanitized: list[dict[str, str]] = []
        for item in history:
            if not isinstance(item, dict):
                continue
            role = item.get("role")
            content = item.get("content")
            if role not in ("user", "assistant") or not isinstance(content, str):
                continue
            content = content.strip()
            if not content:
                continue
            sanitized.append({"role": role, "content": content[:2000]})
        # Giữ tối đa MAX_CHAT_HISTORY_TURNS lượt (cặp user+assistant) tính từ cuối
        return sanitized[-MAX_CHAT_HISTORY_TURNS * 2 :]

    def _previous_food_from_history(self, history: list[dict[str, str]]) -> dict[str, str] | None:
        """Tìm món ăn/nguyên liệu gần nhất user hỏi trong history (ưu tiên user, sau đó assistant)."""
        for item in reversed(history):
            if item["role"] != "user":
                continue
            matched = self.matcher.find_food_in_text(item["content"])
            if matched:
                return matched
        return None

    def chat(
        self,
        user_message: str,
        active_conditions: list[str] | None = None,
        history: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        """
        Xử lý tin nhắn người dùng và trả về phản hồi chuẩn y khoa kết hợp Real LLM.
        Xử lý thông minh cả câu hỏi về món ăn lẫn câu hỏi ngoại lệ/tổng quát.

        Multi-turn: khi câu hiện tại không nhắc món nào (vd "còn phở bò thì sao?"),
        engine thử resolve món từ các lượt user trước trong `history` thay vì trả lời
        ngoài luồng. History cũng được đưa vào prompt LLM để ngữ cảnh liền mạch.
        """
        history = self._sanitize_history(history)
        detected_conditions = extract_conditions_from_text(user_message)
        # dict.fromkeys: khử trùng lặp nhưng GIỮ nguyên thứ tự ổn định (set bị xáo trộn do hash random)
        updated_conditions = list(dict.fromkeys((active_conditions or []) + detected_conditions))

        matched = self.matcher.find_food_in_text(user_message)
        resolved_from_history = False

        if not matched and not is_meta_question(user_message) and _is_food_followup(user_message):
            # Câu hỏi nối tiếp không nhắc món mới ("còn phở bò thì sao?" sau câu
            # hỏi về cơm tấm) → resolve món từ các lượt user trước trong history.
            matched = self._previous_food_from_history(history)
            resolved_from_history = matched is not None

        if not matched:
            # Khi người dùng chào hỏi, hỏi câu ngoài luồng, hoặc hỏi kiến thức dinh dưỡng chung chung
            reply_text = self.llm_client.generate_clinical_consultation(
                user_message=user_message,
                clinical_data=None,
                conditions=updated_conditions,
                chat_history=history,
            )
            return clean_dict({
                "reply_text": reply_text,
                "structured_data": None,
                "active_conditions": updated_conditions,
                "matched_food": None,
                "resolved_from_history": False,
            })

        if matched["type"] == "dish":
            report = self.consult_dish(matched["name"], conditions=updated_conditions)
        else:
            report = self.consult_ingredient(matched["name"], conditions=updated_conditions)

        food_title = report.get("food_name") or report.get("ingredient_name")

        # Đóng gói clinical context y khoa để gửi tới LLM
        clinical_context = {
            "food_name": food_title,
            "food_type": "món ăn" if matched["type"] == "dish" else "nguyên liệu",
            "category": report.get("category", ""),
            "overall_status": report.get("evaluation", {}).get("overall_status", SafetyStatus.SAFE),
            "details": report.get("evaluation", {}).get("details", {}),
            "nutrients": {
                "energy_kcal": report.get("energy_kcal"),
                "protein_g": report.get("protein_g"),
                "fat_g": report.get("fat_g"),
                "carb_g": report.get("carb_g") or report.get("carbohydrate_g"),
                "sodium_mg": report.get("sodium_mg"),
                "purine_mg": report.get("purine_mg"),
                "cholesterol_mg": report.get("cholesterol_mg"),
            },
            "alternatives": report.get("alternatives", []) or report.get("healthy_alternatives", []),
        }

        reply_text = self.llm_client.generate_clinical_consultation(
            user_message=user_message,
            clinical_data=clinical_context,
            conditions=updated_conditions,
            chat_history=history,
        )

        return clean_dict({
            "reply_text": reply_text,
            "structured_data": report,
            "active_conditions": updated_conditions,
            "matched_food": food_title,
            "resolved_from_history": resolved_from_history,
        })


def print_consultation_report(report: dict[str, Any]) -> None:
    """Hàm in báo cáo tư vấn ra terminal hỗ trợ debug."""
    if "error" in report:
        print(f"❌ {report['error']}")
        return

    title_name = report.get("food_name") or report.get("ingredient_name", "Thực phẩm")
    print("\n" + "=" * 70)
    print(f"🏥 BÁO CÁO TƯ VẤN DINH DƯỠNG LÂM SÀNG: {str(title_name).upper()}")
    print("=" * 70)
    eval_data = report.get("evaluation", {})
    print(f"Kết luận: {eval_data.get('overall_status', 'SAFE')}")
    print("=" * 70 + "\n")
