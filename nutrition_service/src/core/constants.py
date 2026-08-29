"""
src/core/constants.py
Nguồn chân lý duy nhất (single source of truth) cho toàn bộ hằng số nghiệp vụ:
- Trạng thái đánh giá an toàn (SAFE / MODERATE / AVOID)
- Metadata bệnh mạn tính & từ khóa nhận diện
- Ngưỡng vi chất lâm sàng cho món ăn / nguyên liệu / cảnh báo Knowledge Graph
"""

from typing import Dict, List

# ─── TRẠNG THÁI ĐÁNH GIÁ AN TOÀN ─────────────────────────────────────────────


class SafetyStatus:
    """Trạng thái đánh giá an toàn thực phẩm. Dùng chuỗi thuần để tương thích 100% JSON."""

    SAFE = "SAFE"
    MODERATE = "MODERATE"
    AVOID = "AVOID"
    ALL = ("SAFE", "MODERATE", "AVOID")


# Nhãn tiếng Việt hiển thị cho người dùng / LLM context
STATUS_VI_LABELS: Dict[str, str] = {
    SafetyStatus.SAFE: "An toàn / Khuyên dùng",
    SafetyStatus.MODERATE: "Cần lưu ý / Kiểm soát khẩu phần",
    SafetyStatus.AVOID: "Nên hạn chế / Tránh dùng",
}

# Icon trạng thái dùng trong phản hồi fallback Markdown
STATUS_EMOJI: Dict[str, str] = {
    SafetyStatus.SAFE: "🟢",
    SafetyStatus.MODERATE: "🟡",
    SafetyStatus.AVOID: "🔴",
}

# ─── BỆNH MẠN TÍNH ────────────────────────────────────────────────────────────

CHRONIC_CONDITIONS: Dict[str, Dict[str, object]] = {
    "DIABETES": {
        "name_vi": "Đái tháo đường (Tiểu đường)",
        "description": "Kiểm soát chặt đường bột (Carb), đường đơn, chỉ số GI/GL, tăng cường chất xơ.",
        "key_nutrients": ["carbohydrate_g", "carb_g", "fiber_g", "fructose_g", "glucose_g", "sucrose_g", "energy_kcal"],
    },
    "HYPERTENSION": {
        "name_vi": "Tăng huyết áp & Tim mạch",
        "description": "Hạn chế Natri/muối (< 2000mg/ngày), kiểm soát chất béo bão hòa, cân đối Kali.",
        "key_nutrients": ["sodium_mg", "potassium_mg", "fat_g", "cholesterol_mg"],
    },
    "GOUT": {
        "name_vi": "Bệnh Gout & Tăng Acid Uric",
        "description": "Hạn chế thực phẩm giàu Purine (> 150mg/100g), nội tạng động vật, hải sản, thịt đỏ đậm.",
        "key_nutrients": ["purine_mg", "protein_g"],
    },
    "CKD_NON_DIALYSIS": {
        "name_vi": "Bệnh thận mạn CHƯA lọc máu (GĐ 3-5)",
        "description": "Ăn giảm đạm (0.6 - 0.8g/kg/ngày) để giảm urê máu, kiểm soát Kali, Phốt pho và Natri.",
        "key_nutrients": ["protein_g", "potassium_mg", "phosphorus_mg", "sodium_mg"],
    },
    "CKD_DIALYSIS": {
        "name_vi": "Bệnh thận mạn ĐANG lọc máu chu kỳ (GĐ 5D)",
        "description": "Ăn tăng đạm (1.2 - 1.4g/kg/ngày) bù đắp thất thoát qua màng lọc; kiểm soát rất nghiêm ngặt Kali, Phốt pho, Nước và Muối.",
        "key_nutrients": ["protein_g", "potassium_mg", "phosphorus_mg", "sodium_mg"],
    },
    # Mã cũ giữ lại để tương thích ngược — luôn được ánh xạ về CKD_NON_DIALYSIS
    "CKD": {
        "name_vi": "Bệnh thận mạn (Mặc định: Chưa lọc máu)",
        "description": "Mặc định áp dụng chế độ bảo tồn thận cho bệnh nhân suy thận chưa chạy thận nhân tạo.",
        "key_nutrients": ["protein_g", "potassium_mg", "phosphorus_mg", "sodium_mg"],
    },
    "DYSLIPIDEMIA": {
        "name_vi": "Rối loạn Lipid máu & Gan nhiễm mỡ",
        "description": "Hạn chế Cholesterol (< 200mg/ngày), chất béo bão hòa, đường Fructose tự do.",
        "key_nutrients": ["cholesterol_mg", "fat_g", "fructose_g"],
    },
}

# Ánh xạ mã bệnh cũ -> mã chuẩn
LEGACY_CONDITION_ALIASES: Dict[str, str] = {"CKD": "CKD_NON_DIALYSIS"}

# Danh sách bệnh đánh giá mặc định khi người dùng không chỉ định
DEFAULT_CONDITIONS: List[str] = [
    "DIABETES",
    "HYPERTENSION",
    "GOUT",
    "CKD_NON_DIALYSIS",
    "DYSLIPIDEMIA",
]

# Từ khóa nhận diện bệnh lý trong câu hỏi tự nhiên (single source cho cả NLP matcher)
CONDITION_KEYWORDS_MAP: Dict[str, List[str]] = {
    "DIABETES": ["tiểu đường", "đái tháo đường", "đường huyết", "diabetes", "type 2", "đường máu"],
    "HYPERTENSION": ["huyết áp", "tăng huyết áp", "cao huyết áp", "tim mạch", "hypertension", "mạch vành"],
    "GOUT": ["gút", "gout", "acid uric", "axit uric", "sưng ngón chân", "viêm khớp gút"],
    "CKD_NON_DIALYSIS": ["suy thận", "thận mạn", "thận", "ckd", "creatinine", "egfr", "chưa lọc máu"],
    "CKD_DIALYSIS": ["lọc máu", "chạy thận", "thẩm phân", "thận nhân tạo"],
    "DYSLIPIDEMIA": ["mỡ máu", "rối loạn lipid", "cholesterol", "triglyceride", "gan nhiễm mỡ", "xơ vữa"],
}


def _build_all_condition_keywords() -> List[str]:
    """Hợp nhất từ khóa theo bệnh + các cụm bổ sung, sắp xếp dài->ngắn để replace an toàn."""
    extra = ["bệnh gút"]  # các cụm từ lịch sử cần được loại bỏ khi làm sạch câu hỏi
    seen = set()
    merged = []
    for keywords in CONDITION_KEYWORDS_MAP.values():
        for kw in keywords:
            if kw not in seen:
                seen.add(kw)
                merged.append(kw)
    for kw in extra:
        if kw not in seen:
            seen.add(kw)
            merged.append(kw)
    return sorted(merged, key=len, reverse=True)


ALL_CONDITION_KEYWORDS: List[str] = _build_all_condition_keywords()

# ─── NGƯỠNG VI CHẤT LÂM SÀNG ─────────────────────────────────────────────────
# Mọi ngưỡng định lượng tập trung tại đây; rules.py và import_data.py cùng đọc.

# Ngưỡng đánh giá MÓN ĂN THÀNH PHẨM (theo 1 suất)
DISH_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "DIABETES": {
        "CARB_AVOID": 70.0,
        "CARB_AVOID_LOW_FIBER": 50.0,
        "FIBER_MIN": 1.0,
        "CARB_MODERATE": 40.0,
    },
    "HYPERTENSION": {"SODIUM_AVOID": 1000.0, "SODIUM_MODERATE": 500.0},
    "GOUT": {"PROTEIN_AVOID": 35.0, "PROTEIN_MODERATE": 20.0},
    "CKD_NON_DIALYSIS": {
        "PROTEIN_AVOID": 25.0,
        "POTASSIUM_AVOID": 600.0,
        "SODIUM_AVOID": 1000.0,
        "PROTEIN_MODERATE": 15.0,
        "POTASSIUM_MODERATE": 300.0,
        "SODIUM_MODERATE": 500.0,
    },
    "CKD_DIALYSIS": {
        "POTASSIUM_AVOID": 400.0,
        "SODIUM_AVOID": 800.0,
        "PROTEIN_MIN": 10.0,
        "POTASSIUM_MODERATE": 200.0,
        "SODIUM_MODERATE": 400.0,
    },
    "DYSLIPIDEMIA": {
        "CHOLESTEROL_AVOID": 150.0,
        "FAT_AVOID": 25.0,
        "CHOLESTEROL_MODERATE": 60.0,
        "FAT_MODERATE": 12.0,
    },
}

# Ngưỡng đánh giá NGUYÊN LIỆU THÔ (theo 100g)
INGREDIENT_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "DIABETES": {
        "SUGARS_AVOID": 15.0,
        "CARB_AVOID": 60.0,
        "FIBER_MIN": 2.0,
        "CARB_MODERATE": 25.0,
        "SUGARS_MODERATE": 5.0,
    },
    "HYPERTENSION": {"SODIUM_AVOID": 400.0, "SODIUM_MODERATE": 150.0},
    "GOUT": {"PURINE_AVOID": 150.0, "PURINE_MODERATE": 50.0},
    "CKD_NON_DIALYSIS": {
        "POTASSIUM_AVOID": 400.0,
        "PHOSPHORUS_AVOID": 200.0,
        "PROTEIN_MODERATE": 15.0,
        "POTASSIUM_MODERATE": 200.0,
        "PHOSPHORUS_MODERATE": 100.0,
    },
    "CKD_DIALYSIS": {
        "POTASSIUM_AVOID": 300.0,
        "PHOSPHORUS_AVOID": 150.0,
        "PROTEIN_GOOD": 12.0,
    },
    "DYSLIPIDEMIA": {
        "CHOLESTEROL_AVOID": 150.0,
        "FAT_AVOID": 30.0,
        "FRUCTOSE_AVOID": 10.0,
        "CHOLESTEROL_MODERATE": 50.0,
        "FAT_MODERATE": 10.0,
    },
}

# Ngưỡng tạo cạnh cảnh báo [:CANH_BAO_CHO] trên Knowledge Graph Neo4j
GRAPH_WARNING_THRESHOLDS: Dict[str, float] = {
    "FOOD_SODIUM": 800.0,       # Natri món ăn cảnh báo HYPERTENSION + CKD_NON_DIALYSIS
    "FOOD_CHOLESTEROL": 150.0,  # Cholesterol món ăn cảnh báo DYSLIPIDEMIA
    "INGREDIENT_PURINE": 150.0, # Purine nguyên liệu cảnh báo GOUT
}

# ─── TỪ KHÓA THỰC PHẨM ───────────────────────────────────────────────────────

# Danh sách từ khóa món ngọt / chè / tráng miệng có GI cao
SWEET_DISH_KEYWORDS = [
    "chè", "bánh rán đường", "bánh trôi", "bánh chay", "bánh cốm",
    "hoa quả dầm", "nước ép", "sinh tố", "bánh ngọt", "kẹo", "trân châu",
    "mứt", "caramel", "tào phớ đường", "kem",
]

# Từ khóa thực phẩm giàu purine
HIGH_PURINE_KEYWORDS = [
    "lòng", "óc", "tim", "bầu dục", "cật", "gan", "dạ dày",
    "ốc", "nghêu", "sò", "hến", "mực", "cua", "ghẹ", "tôm nõn", "ếch",
]

# ─── LLM ─────────────────────────────────────────────────────────────────────

MAX_CHAT_HISTORY_TURNS = 4
