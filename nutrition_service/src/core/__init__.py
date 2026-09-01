"""
src/core
Lớp hạ tầng dùng chung: hằng số nghiệp vụ, ngưỡng lâm sàng và cấu hình ứng dụng.
"""

from src.core.constants import (
    CHRONIC_CONDITIONS,
    DEFAULT_CONDITIONS,
    GRAPH_WARNING_THRESHOLDS,
    LEGACY_CONDITION_ALIASES,
    MAX_CHAT_HISTORY_TURNS,
    STATUS_EMOJI,
    STATUS_VI_LABELS,
    SafetyStatus,
)
from src.core.settings import Settings, get_settings

__all__ = [
    "CHRONIC_CONDITIONS",
    "DEFAULT_CONDITIONS",
    "GRAPH_WARNING_THRESHOLDS",
    "LEGACY_CONDITION_ALIASES",
    "MAX_CHAT_HISTORY_TURNS",
    "SafetyStatus",
    "STATUS_EMOJI",
    "STATUS_VI_LABELS",
    "Settings",
    "get_settings",
]
