"""
src/services/food_matcher.py
Bộ nhận diện thực phẩm tiếng Việt trong câu hỏi tự nhiên (Multi-tier Smart Matching)
và trích xuất bệnh lý nền từ câu thoại của người dùng.

Tách riêng khỏi NutritionConsultant để dễ kiểm thử và tái sử dụng.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from src.core.constants import ALL_CONDITION_KEYWORDS, CONDITION_KEYWORDS_MAP

# ─── BỘ TỪ ĐIỂN ĐỒNG NGHĨA & TIỀN XỬ LÝ TIẾNG VIỆT ──────────────────────────

SYNONYMS = {
    "thịt heo": "thịt lợn",
    "thịt ba rọi": "thịt lợn ba chỉ",
    "ba rọi": "ba chỉ",
    "heo": "lợn",
    "trứng chiên": "trứng rán",
    "chiên": "rán",
    "tàu hũ": "đậu phụ",
    "tàu hủ": "đậu phụ",
    "đậu hũ": "đậu phụ",
    "đậu hủ": "đậu phụ",
    "chả lụa": "giò lụa",
    "yaourt": "sữa chua",
    "nước ngọt": "nước giải khát",
    "cơm sườn": "cơm tấm sườn",
    "cơm tấm bì": "cơm tấm",
    "mực xào": "mực",
    "tôm luộc": "tôm",
    "tôm hấp": "tôm",
    "gà luộc": "thịt gà",
    "gà nướng": "thịt gà",
    "gà rán": "thịt gà",
    "bò xào": "thịt bò xào",
}

QUESTION_STOP_WORDS = [
    "tôi", "mình", "em", "anh", "chị", "bạn", "bệnh nhân", "người",
    "bị", "mắc", "đang", "vừa", "sắp",
    "ăn", "uống", "dùng", "thưởng thức", "nạp",
    "được không", "được k", "được ko", "được chăng", "có được không", "có tốt không", "có nên không",
    "kiêng gì", "kiêng ăn gì", "nên ăn gì", "không nên ăn gì", "nên kiêng gì", "kiêng những gì",
    "không", "ko", "k", "chưa", "hả", "sao", "thế nào", "ra sao", "được", "nên", "có", "tốt", "xấu",
    "bác sĩ", "trợ lý", "ai", "chuyên gia", "tư vấn", "cho hỏi", "hỏi", "giúp", "cho", "với",
    "sáng nay", "trưa nay", "tối nay", "hôm nay", "mỗi ngày", "hàng ngày",
    "nhé", "ạ", "ơi", "nha", "nghen", "với ạ", "giúp em", "giúp tôi",
    # Thuật ngữ chung về nhóm thực phẩm / chế độ ăn (General nutrition terms)
    "nhóm thực phẩm", "thực phẩm", "đồ ăn", "thức ăn", "món ăn", "dinh dưỡng",
    "chất dinh dưỡng", "chất", "vi chất", "chế độ ăn", "thực đơn", "nhóm chất",
    "thành phần", "bữa ăn", "khẩu phần", "nhóm", "loại", "thực vật", "động vật",
]

# Danh sách từ đơn thực phẩm hợp lệ
VALID_SINGLE_FOODS = {
    "bún", "gạo", "cơm", "phở", "cá", "tôm", "thịt", "trứng", "sữa", "chè", "bánh",
    "ngô", "khoai", "sắn", "mì", "miến", "cháo", "nấm", "đậu", "ổi", "táo", "cam",
    "chuối", "nho", "dưa", "xoài", "mận", "bơ", "mực", "cua", "ốc", "hàu", "ếch",
    "lươn", "vịt", "ngỗng", "chim", "heo", "lợn", "bò", "gà", "dê", "cừu", "rau", "củ", "bia", "rượu",
}

# Gia vị phụ: tránh bắt nhầm khi câu hỏi có nhiều từ
SEASONING_WORDS = {"muối", "đường", "dầu", "mỡ", "tiêu", "nước mắm", "thìa là", "ớt"}

# Token chung cần loại khỏi cụm tìm kiếm n-gram
PHRASE_STOP_TOKENS = {"là", "gì", "ở", "và", "hay", "ra", "vào"}

# Danh sách regex các mẫu câu hỏi meta / ngoài luồng / chào hỏi thông thường
META_PATTERNS = [
    r"bạn là (ai|model|gì|gì vậy|ai tạo|gì thế)",
    r"model gì",
    r"ai tạo ra (bạn|em|mày)",
    r"tên (bạn|em) là gì",
    r"kể (chuyện|cho tôi)",
    r"thời tiết",
    r"^(chào|xin chào|hello|hi|cảm ơn|tạm biệt|bye)[\s!.,?]*$",
    r"^(bạn|em) làm được gì",
    r"hướng dẫn sử dụng",
]

_SYNONYM_PATTERNS = [(re.compile(r"(?i)\b" + re.escape(k) + r"\b"), v) for k, v in SYNONYMS.items()]
_STOPWORD_PATTERNS = [
    (re.compile(r"(?i)\b" + re.escape(sw) + r"\b"), sw)
    for sw in sorted(QUESTION_STOP_WORDS, key=len, reverse=True)
]
_META_COMPILED = [re.compile(p, re.IGNORECASE) for p in META_PATTERNS]


def _boundary_pattern(text: str) -> "re.Pattern[str]":
    """Regex khớp `text` trọn vẹn theo ranh giới từ (dùng ở cả 2 chiều tra cứu)."""
    return re.compile(r"(?i)(?:\b|^)" + re.escape(text) + r"(?:\b|$)")


def categorize_dish(food_name: str) -> str:
    """Phân loại món ăn theo nhóm ẩm thực để gợi ý thay thế phù hợp ngữ cảnh."""
    name = str(food_name).lower()
    if any(k in name for k in ["bún", "phở", "miến", "hủ tiếu", "bánh canh", "cháo", "mỳ", "súp"]):
        return "MON_SOI_NUOC"
    if any(k in name for k in ["cơm", "xôi", "cơm rang", "cơm suất", "cơm sườn", "cơm tấm"]):
        return "MON_COM"
    if any(
        k in name for k in ["lẩu", "xào", "nộm", "gỏi", "hấp", "luộc", "kho", "thịt", "canh", "cá", "tôm", "gà", "bò", "heo", "lợn"]
    ):
        return "MON_MAN_LAU"
    if any(k in name for k in ["chè", "nước ép", "sinh tố", "hoa quả", "bánh ngọt", "kẹo", "tào phớ", "sữa chua", "trái cây"]):
        return "MON_TRANG_MIENG"
    return "MON_BANH_KHAC"


def extract_conditions_from_text(text: str) -> List[str]:
    """Trích xuất tự động các bệnh lý mạn tính từ câu thoại người dùng."""
    text_lower = text.lower()
    found = set()
    for cond_id, keywords in CONDITION_KEYWORDS_MAP.items():
        if any(kw in text_lower for kw in keywords):
            found.add(cond_id)
    return list(found)


class FoodMatcher:
    """Matcher 3 tầng (exact → word-boundary → n-gram) trên danh mục món ăn & nguyên liệu."""

    def __init__(self, dishes_df: pd.DataFrame, ingredients_df: pd.DataFrame):
        self._dish_names: List[Tuple[str, str]] = self._build_name_index(dishes_df, "food_name")
        self._ingredient_names: List[Tuple[str, str]] = self._build_name_index(ingredients_df, "ingredient_name")
        # Precompile sẵn regex ranh giới từ cho toàn bộ tên (tránh re-compile mỗi lần gọi matcher)
        self._dish_patterns: List[Tuple[re.Pattern[str], str]] = [
            (_boundary_pattern(lower), orig) for lower, orig in self._dish_names
        ]
        self._ingredient_patterns: List[Tuple[re.Pattern[str], str]] = [
            (_boundary_pattern(lower), orig) for lower, orig in self._ingredient_names
        ]
        self._condition_keywords_sorted = sorted(ALL_CONDITION_KEYWORDS, key=len, reverse=True)

    @staticmethod
    def _build_name_index(df: pd.DataFrame, col: str) -> List[Tuple[str, str]]:
        """Danh sách (tên_thường, tên_gốc) đã chuẩn hoá sẵn để tra cứu nhanh."""
        if col not in df.columns:
            return []
        return [(str(name).lower(), str(name)) for name in df[col].dropna()]

    # ── Tiền xử lý văn bản ────────────────────────────────────────────────────

    def clean_text(self, text: str) -> str:
        """Làm sạch chuỗi truy vấn để trích xuất thực phẩm chính xác."""
        t = text.lower().strip()

        # 1. Bỏ từ khóa bệnh lý mạn tính (tránh từ 'đường' trong 'tiểu đường' khớp nhầm món ngọt)
        for ck in self._condition_keywords_sorted:
            t = t.replace(ck, " ")

        # 2. Thay thế từ đồng nghĩa
        for pattern, replacement in _SYNONYM_PATTERNS:
            t = pattern.sub(replacement, t)

        # 3. Bỏ stop words câu hỏi
        for pattern, _sw in _STOPWORD_PATTERNS:
            t = pattern.sub(" ", t)

        t = re.sub(r"[^\w\s]", " ", t)
        t = re.sub(r"\s+", " ", t).strip()
        return t

    # ── Matching 3 tầng ───────────────────────────────────────────────────────

    def find_food_in_text(self, text: str) -> Optional[Dict[str, str]]:
        """
        Tìm món ăn hoặc nguyên liệu thông minh (Multi-tier Smart Matching)
        từ câu hỏi tự nhiên của người dùng. Trả về None nếu là câu hỏi meta/ngoài luồng.
        """
        raw_lower = text.lower().strip()

        # Bỏ qua ngay các câu hỏi meta / ngoài luồng / chào hỏi
        if any(pattern.search(raw_lower) for pattern in _META_COMPILED):
            return None

        cleaned = self.clean_text(text)

        # Nếu sau khi làm sạch chuỗi quá ngắn hoặc không có từ thực phẩm
        if len(cleaned) < 2:
            return None

        # Tier 1: Khớp chính xác hoàn toàn với chuỗi đã làm sạch
        for d_lower, d_orig in self._dish_names:
            if d_lower == cleaned:
                return {"name": d_orig, "type": "dish"}
        for i_lower, i_orig in self._ingredient_names:
            if i_lower == cleaned:
                return {"name": i_orig, "type": "ingredient"}

        match = self._match_word_boundary(raw_lower, cleaned)
        if match:
            return match

        return self._match_ngram(cleaned)

    def _match_word_boundary(self, raw_lower: str, cleaned: str) -> Optional[Dict[str, str]]:
        """Tier 2: Substring matching có kiểm tra ranh giới từ (Word Boundary)."""
        matches: List[Tuple[float, str, str]] = []
        is_clean_single = len(cleaned.split()) == 1
        is_valid_single = cleaned in VALID_SINGLE_FOODS
        reverse_ok = (not is_clean_single or is_valid_single) and len(cleaned) >= 4
        reverse_pattern = (
            re.compile(r"(?i)(?:\b|^)" + re.escape(cleaned) + r"(?:\b|$)") if reverse_ok else None
        )

        for d_lower, d_orig in self._dish_names:
            # Món ăn phải xuất hiện trọn vẹn trong raw_lower hoặc cleaned khớp với d_lower
            if re.search(r"(?i)(?:\b|^)" + re.escape(d_lower) + r"(?:\b|$)", raw_lower) or (
                reverse_pattern and reverse_pattern.search(d_lower)
            ):
                score = len(d_lower) * 2 + (20 if cleaned in d_lower else 0)
                matches.append((score, d_orig, "dish"))

        for i_lower, i_orig in self._ingredient_names:
            # Tránh bắt nhầm gia vị phụ khi câu hỏi có nhiều từ
            if i_lower in SEASONING_WORDS and not is_clean_single:
                continue

            if re.search(r"(?i)(?:\b|^)" + re.escape(i_lower) + r"(?:\b|$)", raw_lower) or (
                reverse_pattern and reverse_pattern.search(i_lower)
            ):
                score = len(i_lower) + (10 if cleaned in i_lower else 0)
                matches.append((score, i_orig, "ingredient"))

        if matches:
            matches.sort(key=lambda x: x[0], reverse=True)
            return {"name": matches[0][1], "type": matches[0][2]}
        return None

    def _match_ngram(self, cleaned: str) -> Optional[Dict[str, str]]:
        """Tier 3: Token / N-gram search."""
        words = [w for w in cleaned.split() if len(w) >= 2 and w not in PHRASE_STOP_TOKENS]
        if not words:
            return None

        phrases: List[str] = []
        for n in range(min(4, len(words)), 0, -1):
            for i in range(len(words) - n + 1):
                phrases.append(" ".join(words[i:i + n]))

        for phrase in phrases:
            # Nếu là từ đơn, bắt buộc phải nằm trong danh sách VALID_SINGLE_FOODS
            if len(phrase.split()) == 1 and phrase not in VALID_SINGLE_FOODS:
                continue
            if len(phrase) < 3:
                continue

            p_matches: List[Tuple[int, str, str]] = []
            for d_lower, d_orig in self._dish_names:
                if re.search(r"(?i)(?:\b|^)" + re.escape(phrase) + r"(?:\b|$)", d_lower):
                    p_matches.append((len(d_orig), d_orig, "dish"))
            for i_lower, i_orig in self._ingredient_names:
                if re.search(r"(?i)(?:\b|^)" + re.escape(phrase) + r"(?:\b|$)", i_lower):
                    p_matches.append((len(i_orig), i_orig, "ingredient"))
            if p_matches:
                p_matches.sort(key=lambda x: x[0])  # Ưu tiên tên ngắn gọn, khớp sát nhất
                return {"name": p_matches[0][1], "type": p_matches[0][2]}

        return None


def to_native(val: Any) -> Any:
    """Quy đổi numpy/pandas types sang native Python types (int, float, None)."""
    if pd.isna(val) or val is None:
        return None
    if isinstance(val, (np.integer, int)):
        return int(val)
    if isinstance(val, (np.floating, float)):
        return float(val)
    return val


def clean_dict(d: Any) -> Any:
    """Làm sạch dictionary để jsonify tương thích 100% chuẩn JSON."""
    if isinstance(d, dict):
        return {k: clean_dict(v) for k, v in d.items()}
    if isinstance(d, list):
        return [clean_dict(v) for v in d]
    return to_native(d)
