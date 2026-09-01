"""
app.py
Máy chủ Web API & UI cho Trợ lý Dinh Dưỡng Bệnh Mạn Tính (NutriChat AI).

Kiến trúc:
- Application Factory (create_app) giúp test không phải load lại dataset mỗi lần import.
- CORS & xử lý lỗi tập trung tại một chỗ, cấu hình qua biến môi trường:
    CORS_ORIGINS   : danh sách origin cách nhau bởi dấu phẩy (mặc định chỉ dev frontend)
    CLIENT_ORIGIN  : origin production (được thêm tự động vào danh sách cho phép)
"""

from __future__ import annotations

import logging
import os
import sys

if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask, jsonify, request

from src.core.settings import get_settings
from src.services.consultant import NutritionConsultant

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def _is_origin_allowed(origin: str, allowed_origins) -> bool:
    if not origin:
        return True  # same-origin request / curl / healthcheck
    normalized = origin.strip().rstrip("/")
    return normalized in {o.rstrip("/") for o in allowed_origins} or "*" in allowed_origins


def create_app(consultant: NutritionConsultant | None = None) -> Flask:
    """Khởi tạo ứng dụng Flask với dependency injection và middleware tập trung."""
    settings = get_settings()
    flask_app = Flask(__name__, template_folder="templates")
    flask_app.config["CONSULTANT"] = consultant or NutritionConsultant()
    flask_app.config["CORS_ALLOWED_ORIGINS"] = tuple(settings.cors_origins)

    # ── Middleware tập trung ──────────────────────────────────────────────────

    @flask_app.before_request
    def handle_preflight():
        """Trả lời sớm các preflight OPTIONS request (CORS)."""
        if request.method == "OPTIONS":
            return "", 204

    @flask_app.after_request
    def add_cors_headers(response):
        """Cho phép Frontend React (Vite) trong danh sách origin gọi API không bị chặn."""
        origin = request.headers.get("Origin", "")
        if _is_origin_allowed(origin, flask_app.config["CORS_ALLOWED_ORIGINS"]):
            allow_origin = "*" if "*" in flask_app.config["CORS_ALLOWED_ORIGINS"] else origin
            response.headers["Access-Control-Allow-Origin"] = allow_origin or "*"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        return response

    @flask_app.errorhandler(Exception)
    def handle_global_error(e):
        """Bắt toàn bộ ngoại lệ: ghi log đầy đủ phía server, trả về thông báo chung an toàn."""
        logger.error("Unhandled Exception: %s", e, exc_info=True)
        payload = {"error": "Đã xảy ra lỗi trên máy chủ xử lý dữ liệu dinh dưỡng."}
        if flask_app.config.get("TESTING") or flask_app.debug:
            payload["details"] = str(e)
        return jsonify(payload), 500

    # ── Routes ────────────────────────────────────────────────────────────────

    @flask_app.route("/")
    def index():
        return jsonify({"service": "nutrition", "status": "ok"})

    @flask_app.route("/api/health")
    def health():
        svc: NutritionConsultant = flask_app.config["CONSULTANT"]
        return jsonify({
            "service": "nutrition",
            "status": "ok",
            "data_source": getattr(svc, "source", "unknown"),
        })

    @flask_app.route("/api/suggestions")
    def get_suggestions():
        """Lấy danh sách tên món ăn và nguyên liệu phục vụ autocomplete."""
        svc: NutritionConsultant = flask_app.config["CONSULTANT"]
        return jsonify(svc.suggestion_items())

    @flask_app.route("/api/dish", methods=["GET"])
    def get_dish_details():
        """Tra cứu chi tiết vi chất của 1 món ăn hoặc nguyên liệu theo tên."""
        name = request.args.get("name", "").strip()
        if not name:
            return jsonify({"error": "Thiếu tham số 'name'."}), 400
        svc: NutritionConsultant = flask_app.config["CONSULTANT"]
        return jsonify(svc.consult_any(name))

    @flask_app.route("/api/consult", methods=["POST"])
    def consult():
        data = request.get_json() or {}
        query = data.get("query", "").strip()
        conditions = data.get("conditions") or None

        if not query:
            return jsonify({"error": "Vui lòng nhập tên món ăn hoặc nguyên liệu."}), 400

        svc: NutritionConsultant = flask_app.config["CONSULTANT"]
        return jsonify(svc.consult_any(query, conditions=conditions))

    @flask_app.route("/api/chat", methods=["POST"])
    def chat():
        data = request.get_json() or {}
        message = data.get("message", "").strip()
        conditions = data.get("conditions", [])
        history = data.get("history") or []

        if not message:
            return jsonify({"error": "Vui lòng nhập tin nhắn hoặc tên món ăn."}), 400

        svc: NutritionConsultant = flask_app.config["CONSULTANT"]
        return jsonify(
            svc.chat(user_message=message, active_conditions=conditions, history=history)
        )

    return flask_app


# Instance mặc định cho WSGI server (gunicorn/Docker) và test cũ (`from app import app`)
app = create_app()


if __name__ == "__main__":
    port = get_settings().nutrition_port
    logger.info(f"🚀 Máy chủ Dinh dưỡng NutriChat đang chạy trên cổng {port}")
    app.run(host="0.0.0.0", port=port, debug=False)
