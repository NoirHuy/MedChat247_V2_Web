"""
tests/test_app_chat_history.py
Kiểm tra route /api/chat chuyển tiếp `history` từ Node gateway vào consultant.
Dùng FakeConsultant (dependency injection) để không load CSV/LLM thật.
"""

import pytest

from app import create_app


class FakeConsultant:
    def __init__(self):
        self.calls = []

    def chat(self, user_message, active_conditions=None, history=None):
        self.calls.append(
            {"message": user_message, "conditions": active_conditions, "history": history}
        )
        return {
            "reply_text": "Phản hồi mô phỏng.",
            "structured_data": None,
            "active_conditions": list(active_conditions or []),
            "matched_food": None,
            "resolved_from_history": False,
        }


@pytest.fixture
def fake():
    return FakeConsultant()


@pytest.fixture
def client(fake):
    app = create_app(consultant=fake)
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_chat_forwards_history_to_consultant(client, fake):
    resp = client.post(
        "/api/chat",
        json={
            "message": "Còn món đó thì sao?",
            "conditions": ["GOUT"],
            "history": [
                {"role": "user", "content": "Chè khúc bạch bao nhiêu calo?"},
                {"role": "assistant", "content": "284 kcal."},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["reply_text"] == "Phản hồi mô phỏng."

    call = fake.calls[0]
    assert call["message"] == "Còn món đó thì sao?"
    assert call["conditions"] == ["GOUT"]
    assert call["history"] == [
        {"role": "user", "content": "Chè khúc bạch bao nhiêu calo?"},
        {"role": "assistant", "content": "284 kcal."},
    ]


def test_chat_without_history_still_works(client, fake):
    resp = client.post("/api/chat", json={"message": "phở bò", "conditions": []})
    assert resp.status_code == 200
    assert fake.calls[0]["history"] == []


def test_chat_requires_message(client, fake):
    resp = client.post("/api/chat", json={"message": "   "})
    assert resp.status_code == 400
    assert fake.calls == []


def test_chat_empty_history_field_defaults_to_list(client, fake):
    resp = client.post("/api/chat", json={"message": "phở bò", "history": None})
    assert resp.status_code == 200
    assert fake.calls[0]["history"] == []
