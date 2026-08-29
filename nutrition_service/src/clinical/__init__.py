"""
src/clinical
Quy tắc lâm sàng & bộ đánh giá an toàn thực phẩm cho bệnh mạn tính.
"""

from src.core.constants import (
    CHRONIC_CONDITIONS,
    DEFAULT_CONDITIONS,
    SafetyStatus,
)
from src.clinical.rules import (
    HIGH_PURINE_KEYWORDS,
    SWEET_DISH_KEYWORDS,
    ChronicDiseaseEvaluator,
    aggregate_overall_status,
    normalize_conditions,
)

__all__ = [
    "CHRONIC_CONDITIONS",
    "DEFAULT_CONDITIONS",
    "SafetyStatus",
    "SWEET_DISH_KEYWORDS",
    "HIGH_PURINE_KEYWORDS",
    "ChronicDiseaseEvaluator",
    "aggregate_overall_status",
    "normalize_conditions",
]
