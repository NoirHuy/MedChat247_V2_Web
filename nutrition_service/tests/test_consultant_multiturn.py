"""
tests/test_consultant_multiturn.py
Kiểm tra tư vấn multi-turn (Phase 1 — multi-turn context):
- `chat()` nhận `history` đã sanitize (đúng role, cắt độ dài, giới hạn số lượt).
- Câu hỏi nối tiếp ("còn phở bò thì sao?") được resolve món từ lượt user trước.
- Câu chào hỏi / meta / cảm ơn KHÔNG bị gắn nhầm món cũ.
- `active_conditions` gửi từ Node được giữ nguyên và trả về.
"""

import pytest

from src.core.constants import SafetyStatus
from src.services.consultant import NutritionConsultant, _is_food_followup


@pytest.fixture(scope="module")
def consultant():
    return NutritionConsultant()


class TestSanitizeHistory:
    def test_empty_and_invalid_history(self, consultant):
        assert consultant._sanitize_history(None) == []
        assert consultant._sanitize_history("not a list") == []
        assert consultant._sanitize_history([None, 42, {"role": "user"}]) == []

    def test_keeps_only_user_assistant_roles(self, consultant):
        history = consultant._sanitize_history(
            [
                {"role": "system", "content": "hack"},
                {"role": "user", "content": "cơm tấm bao nhiêu calo"},
                {"role": "assistant", "content": "khoảng 480 kcal"},
                {"role": "tool", "content": "junk"},
            ]
        )
        assert [m["role"] for m in history] == ["user", "assistant"]

    def test_caps_message_length_and_turns(self, consultant):
        long_text = "x" * 3000
        history = consultant._sanitize_history(
            [{"role": "user", "content": long_text}]
        )
        assert len(history[0]["content"]) == 2000

        many_turns = []
        for i in range(20):
            many_turns.append({"role": "user", "content": f"món {i}"})
            many_turns.append({"role": "assistant", "content": f"trả lời {i}"})
        capped = consultant._sanitize_history(many_turns)
        # MAX_CHAT_HISTORY_TURNS = 4 lượt → 8 messages
        assert len(capped) <= 8
        assert capped[-1]["content"] == "trả lời 19"

    def test_strips_empty_content(self, consultant):
        history = consultant._sanitize_history(
            [
                {"role": "user", "content": "   "},
                {"role": "user", "content": "phở bò"},
            ]
        )
        assert len(history) == 1
        assert history[0]["content"] == "phở bò"


class TestFollowupDetection:
    def test_followup_cues_detected(self):
        assert _is_food_followup("còn phở bò thì sao?")
        assert _is_food_followup("vậy nó bao nhiêu calo?")
        assert _is_food_followup("món đó tốt cho người tiểu đường không?")
        assert _is_food_followup("nếu ăn món này hàng ngày thì sao?")

    def test_non_followup_not_detected(self):
        assert not _is_food_followup("chào bạn")
        assert not _is_food_followup("cảm ơn bạn nhé!")
        assert not _is_food_followup("")
        assert not _is_food_followup("a" * 300)


class TestChatMultiturn:
    PHO_QUESTION = "Phở bò tái bình dân cho người tiểu đường được không?"

    def test_followup_resolves_food_from_history(self, consultant):
        # "còn món đó thì sao?" không match món nào ở tier matcher (probe thực tế)
        # → phải resolve được món từ lượt user trước trong history.
        result = consultant.chat(
            user_message="Còn món đó thì sao?",
            active_conditions=["DIABETES"],
            history=[
                {"role": "user", "content": self.PHO_QUESTION},
                {"role": "assistant", "content": "Phở bò tái bình dân cần lưu ý với người tiểu đường."},
            ],
        )
        assert result.get("matched_food"), f"expected a food, got: {result}"
        assert "phở bò" in str(result["matched_food"]).lower()
        assert result["resolved_from_history"] is True
        assert result["structured_data"] is not None

    def test_food_mentioned_in_current_message_wins(self, consultant):
        # "Còn phở bò thì sao?" tự match được ở tier n-gram → KHÔNG dùng history
        result = consultant.chat(
            user_message="Còn phở bò thì sao?",
            active_conditions=[],
            history=[
                {"role": "user", "content": "Chè khúc bạch bao nhiêu calo?"},
                {"role": "assistant", "content": "Chè khúc bạch có 284 kcal."},
            ],
        )
        assert result["matched_food"] is not None
        assert "phở bò" in str(result["matched_food"]).lower()
        assert result["resolved_from_history"] is False

    def test_greeting_does_not_resolve_from_history(self, consultant):
        result = consultant.chat(
            user_message="Chào bạn!",
            active_conditions=[],
            history=[
                {"role": "user", "content": "Chè khúc bạch bao nhiêu calo?"},
                {"role": "assistant", "content": "284 kcal."},
            ],
        )
        assert result["matched_food"] is None
        assert result["structured_data"] is None
        assert result["resolved_from_history"] is False

    def test_thanks_does_not_resolve_from_history(self, consultant):
        result = consultant.chat(
            user_message="Cảm ơn bạn nhé!",
            active_conditions=[],
            history=[
                {"role": "user", "content": "Chè khúc bạch bao nhiêu calo?"},
                {"role": "assistant", "content": "284 kcal."},
            ],
        )
        assert result["matched_food"] is None
        assert result["resolved_from_history"] is False

    def test_active_conditions_roundtrip(self, consultant):
        result = consultant.chat(
            user_message="Chè khúc bạch cho người tăng huyết áp?",
            active_conditions=["HYPERTENSION"],
            history=[],
        )
        assert "HYPERTENSION" in result["active_conditions"]
        report = result["structured_data"]
        assert report is not None
        assert report["evaluation"]["overall_status"] in (
            SafetyStatus.SAFE,
            SafetyStatus.MODERATE,
            SafetyStatus.AVOID,
        )

    def test_ingredient_followup_resolves_from_history(self, consultant):
        result = consultant.chat(
            user_message="Còn nó thì sao?",
            active_conditions=[],
            history=[
                {"role": "user", "content": "Tôi bị gout, ăn cá trắm được không?"},
                {"role": "assistant", "content": "Cá trắm cần hạn chế với người gout."},
            ],
        )
        assert result.get("matched_food") is not None
        assert "cá trắm" in str(result["matched_food"]).lower()
