"""
src/services/llm_client.py
Client kết nối Mô hình Ngôn ngữ Lớn (LLM) chuẩn OpenAI-compatible
phục vụ tư vấn dinh dưỡng lâm sàng cá nhân hóa (Grounding RAG).

Cấu hình đọc từ biến môi trường: LLM_BASE_URL, LLM_API_KEY, LLM_MODEL,
LLM_TIMEOUT, LLM_TEMPERATURE (xem .env.example). Khi endpoint chưa cấu hình
hoặc lỗi kết nối, client tự động chuyển sang cơ chế Fallback an toàn.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from src.core.constants import MAX_CHAT_HISTORY_TURNS, STATUS_EMOJI, STATUS_VI_LABELS
from src.core.settings import get_settings

logger = logging.getLogger(__name__)

try:
    from openai import OpenAI  # noqa: WPS433 (import có điều kiện theo dependency tuỳ chọn)
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False


class LLMClient:
    """Client giao tiếp với Real LLM Endpoint (OpenAI-compatible) cho Trợ lý Dinh Dưỡng."""

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
        temperature: Optional[float] = None,
    ):
        settings = get_settings()
        self.base_url = (base_url or settings.llm.base_url).strip()
        self.api_key = (api_key or settings.llm.api_key).strip()
        self.model = model or settings.llm.model
        # Tránh bug falsy: chỉ fallback khi tham số thực sự là None
        self.timeout = float(timeout) if timeout is not None else settings.llm.timeout
        self.temperature = float(temperature) if temperature is not None else settings.llm.temperature

        self.client = None
        if not OPENAI_AVAILABLE:
            logger.warning("Thư viện openai chưa cài đặt — LLMClient sẽ luôn dùng chế độ Fallback.")
            return
        if not (self.base_url and self.api_key):
            logger.warning(
                "LLM_BASE_URL hoặc LLM_API_KEY chưa được cấu hình (.env) — "
                "LLMClient sẽ luôn dùng chế độ Fallback."
            )
            return
        try:
            self.client = OpenAI(
                base_url=self.base_url,
                api_key=self.api_key,
                timeout=self.timeout,
            )
        except Exception as e:
            logger.warning(f"Không thể khởi tạo OpenAI client: {e}")

    def build_system_prompt(self) -> str:
        """Tạo System Prompt cho Trợ lý Dinh dưỡng Lâm sàng."""
        return (
            "Bạn là Trợ lý Dinh dưỡng Lâm sàng (NutriChat AI) chuyên nghiệp, ân cần và thấu hiểu.\n"
            "Nhiệm vụ của bạn: Tư vấn, giải thích và phân tích chế độ ăn uống cho người dùng mắc các bệnh mạn tính "
            "(Đái tháo đường, Tăng huyết áp, Bệnh Gout, Bệnh thận mạn, Rối loạn lipid máu).\n\n"
            "NGUYÊN TẮC DINH DƯỠNG BẮT BUỘC:\n"
            "1. TUYỆT ĐỐI TUÂN THỦ DỮ LIỆU ĐƯỢC CUNG CẤP: Mọi kết luận an toàn (An toàn / Cần lưu ý / Nên hạn chế), "
            "số liệu vi chất (Calo, Đạm, Béo, Đường bột, Natri, Purine, Cholesterol) và lý do trong phần CONTEXT dinh dưỡng "
            "đã được thẩm định chuẩn xác. Bạn không được tự ý bịa đặt số liệu khác (Zero Hallucination).\n"
            "2. 100% TIẾNG VIỆT CHUẨN MỰC: Tuyệt đối KHÔNG sử dụng các từ mã tiếng Anh như [SAFE], [MODERATE], [AVOID]. "
            "Hãy dùng tiếng Việt: 'An toàn / Khuyên dùng', 'Cần lưu ý / Kiểm soát', 'Nên hạn chế / Tránh'.\n"
            "3. ĐI THẲNG VÀO NỘI DUNG CHUYÊN MÔN: Không dùng các câu mở đầu sáo rỗng dài dòng như "
            "'Với tư cách là Trợ lý Dinh dưỡng...', 'Tôi xin được giải đáp...'. Hãy đi thẳng vào nhận xét thực phẩm và lời khuyên.\n"
            "4. Nêu rõ các món ăn thay thế an toàn nếu món người dùng hỏi thuộc diện cảnh báo."
        )

    def build_clinical_context(self, clinical_data: Dict[str, Any]) -> str:
        """Chuyển đổi dữ liệu lâm sàng thành bối cảnh y tế chi tiết cho LLM (100% tiếng Việt)."""
        if not clinical_data:
            return "Không có dữ liệu món ăn cụ thể."

        food_name = clinical_data.get("food_name") or clinical_data.get("ingredient_name", "Món ăn")
        food_type = clinical_data.get("food_type", "món ăn")
        category = clinical_data.get("category", "")
        raw_status = clinical_data.get("overall_status", "SAFE")
        status = STATUS_VI_LABELS.get(raw_status, STATUS_VI_LABELS["SAFE"])
        details = clinical_data.get("details", {})
        nutrients = clinical_data.get("nutrients", {})
        alternatives = clinical_data.get("alternatives", [])

        context_lines = [
            f"- Tên thực phẩm: {food_name} ({food_type}, phân nhóm: {category})",
            f"- Đánh giá mức độ an toàn: {status}",
            "- Thành phần dinh dưỡng định lượng:",
            f"  + Năng lượng: {nutrients.get('energy_kcal', 'Chưa rõ')} kcal",
            f"  + Chất đạm (Protein): {nutrients.get('protein_g', 'Chưa rõ')} g",
            f"  + Chất béo (Lipid): {nutrients.get('fat_g', 'Chưa rõ')} g",
            f"  + Chất bột đường (Carb): {nutrients.get('carb_g') or nutrients.get('carbohydrate_g', 'Chưa rõ')} g",
            f"  + Natri (Sodium): {nutrients.get('sodium_mg', 'Chưa rõ')} mg",
            f"  + Purine: {nutrients.get('purine_mg', 'Chưa rõ')} mg",
            f"  + Cholesterol: {nutrients.get('cholesterol_mg', 'Chưa rõ')} mg",
        ]

        if details:
            context_lines.append("- Phân tích theo từng bệnh lý nền:")
            for cond, d in details.items():
                cond_name = d.get("condition_name", cond)
                cond_status = STATUS_VI_LABELS.get(d.get("status", "SAFE"), STATUS_VI_LABELS["SAFE"])
                reasons = ", ".join(d.get("reasons", [])) or "Lành tính"
                context_lines.append(f"  * {cond_name}: {cond_status} - Lý do: {reasons}")

        alt_names = []
        for alt in alternatives:
            if isinstance(alt, str):
                alt_names.append(alt)
            elif isinstance(alt, dict):
                alt_names.append(alt.get("food_name") or alt.get("name", ""))
        alt_names = [name for name in alt_names if name]
        if alt_names:
            context_lines.append(f"- Gợi ý món ăn thay thế an toàn hơn: {', '.join(alt_names)}")

        return "\n".join(context_lines)

    def generate_clinical_consultation(
        self,
        user_message: str,
        clinical_data: Optional[Dict[str, Any]] = None,
        conditions: Optional[List[str]] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
    ) -> str:
        """Gửi yêu cầu tới LLM để sinh câu trả lời tư vấn dinh dưỡng chuẩn xác."""
        system_prompt = self.build_system_prompt()
        context_str = self.build_clinical_context(clinical_data or {})

        user_content = (
            f"BỐI CẢNH Y TẾ & THỰC PHẨM ĐÃ ĐƯỢC THẨM ĐỊNH:\n"
            f"{context_str}\n\n"
            f"CÂU HỎI CỦA NGƯỜI DÙNG:\n\"{user_message}\"\n\n"
            f"Hãy đưa ra lời tư vấn ân cần, giải thích cơ chế và hướng dẫn người dùng dựa trên bối cảnh y tế trên."
        )

        messages: List[Dict[str, str]] = [{"role": "system", "content": system_prompt}]
        if chat_history:
            messages.extend(chat_history[-MAX_CHAT_HISTORY_TURNS:])
        messages.append({"role": "user", "content": user_content})

        if self.client and OPENAI_AVAILABLE:
            try:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=messages,
                    temperature=self.temperature,
                )
                if response.choices:
                    reply = response.choices[0].message.content
                    if reply and reply.strip():
                        return reply.strip()
            except Exception as e:
                logger.warning(f"Lỗi khi gọi Real LLM API ({self.base_url}): {e}. Chuyển sang Fallback.")

        # Cơ chế Graceful Fallback
        return self._generate_fallback_response(user_message, clinical_data)

    def _generate_fallback_response(
        self,
        user_message: str,
        clinical_data: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Tạo phản hồi chuẩn y khoa định dạng Markdown khi LLM không phản hồi."""
        if not clinical_data:
            return (
                "Chào bạn, tôi là Trợ lý Dinh dưỡng NutriChat. "
                "Bạn có thể hỏi tôi về bất kỳ món ăn nào (ví dụ: *'Người tiểu đường ăn chè thái được không?'*, "
                "*'Bún mắm cho người tăng huyết áp'*...) để tôi phân tích vi chất và độ an toàn nhé!"
            )

        food_name = clinical_data.get("food_name") or clinical_data.get("ingredient_name", "Món ăn")
        overall_status = clinical_data.get("overall_status", "SAFE")
        details = clinical_data.get("details", {})
        alternatives = clinical_data.get("alternatives", [])

        status_text_map = {
            "SAFE": "🟢 AN TOÀN / PHÙ HỢP KHUYÊN DÙNG",
            "MODERATE": "🟡 CẦN KIỂM SOÁT KHẨU PHẦN / LƯU Ý",
            "AVOID": "🔴 NÊN HẠN CHẾ / TRÁNH DÙNG",
        }

        lines = [
            f"### 🩺 Phân tích Dinh dưỡng Lâm sàng: **{food_name}**",
            f"**Kết luận y khoa:** {status_text_map.get(overall_status, overall_status)}\n",
            "**Phân tích cơ chế bệnh sinh chi tiết:**",
        ]

        for cond, d in details.items():
            c_name = d.get("condition_name", cond)
            c_icon = STATUS_EMOJI.get(d.get("status"), "⚪")
            lines.append(f"- {c_icon} **{c_name}:** {d.get('status', 'SAFE')}")
            for r in d.get("reasons", []):
                lines.append(f"  • {r}")

        if alternatives:
            lines.append("\n**💡 Đề xuất món ăn tương tự nhưng an toàn & lành mạnh hơn:**")
            for alt in alternatives:
                if isinstance(alt, str):
                    lines.append(f"- 👉 **{alt}**")
                elif isinstance(alt, dict):
                    name = alt.get("food_name") or alt.get("name", "")
                    kcal = alt.get("energy_kcal", "")
                    na = alt.get("sodium_mg", "")
                    carb = alt.get("carbohydrate_g") or alt.get("carb_g", "")
                    extra = []
                    if kcal:
                        extra.append(f"{kcal} kcal")
                    if na:
                        extra.append(f"Natri: {na}mg")
                    if carb:
                        extra.append(f"Carb: {carb}g")
                    extra_str = f" ({', '.join(extra)})" if extra else ""
                    lines.append(f"- 👉 **{name}**{extra_str}")

        lines.append("\n*Lời khuyên: Hãy duy trì chế độ ăn cân đối và tuân thủ phác đồ điều trị của bác sĩ.*")
        return "\n".join(lines)
