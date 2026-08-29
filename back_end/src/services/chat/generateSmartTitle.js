import { env } from '../../config/env.js'
import { auditLog } from '../../utils/auditLog.js'
import { callLLM } from '../llm/llmClient.js'

// ─── DYNAMIC AI SMART TITLE GENERATION (CHATGPT STYLE) ────────────────────────
export async function generateSmartTitle(userText, lang = 'vi') {
  if (!userText || typeof userText !== 'string') {
    return lang === 'en' ? 'New Conversation' : 'Cuộc trò chuyện mới'
  }

  const cleanInput = userText.trim().replace(/\[.*?\]/g, '').replace(/[*_`]/g, '')
  if (!cleanInput) {
    return lang === 'en' ? 'New Conversation' : 'Cuộc trò chuyện mới'
  }

  const isEn = lang === 'en'

  // 1. GỬI TRỰC TIẾP CHO LLM TẠO TIÊU ĐỀ SÚC TÍCH (ƯU TIÊN HÀNG ĐẦU)
  if (env.llmApiKey) {
    try {
      const systemPrompt = isEn
        ? `You are an expert concise chat titler (similar to ChatGPT).
Summarize the key idea of the user's message into EXACTLY ONE short title of 2 to 4 English words.

MANDATORY RULES:
- Greetings ("hello", "hi", "good morning") -> Title: "Initial Greeting" or "Getting Started".
- Demographics/Age ("I am 22 years old") -> Title: "Age & Health Consultation".
- Messages describing symptoms -> Title format: "Consultation: [Symptoms]" or "Evaluation: [Symptoms]" (e.g. "Consultation: Sore Throat & Fever", "Evaluation: Acute Abdomen"). DO NOT use the word "Diagnosis".
- Other topics -> Short topic title (e.g. "Payment Guide", "Fever Medication Q&A").
- NEVER name it "New Conversation".
- RETURN ONLY THE TITLE TEXT, NO QUOTES, NO EXTRA WORDS.`
        : `Bạn là chuyên gia tạo tiêu đề súc tích cho đoạn chat (tương tự ChatGPT).
Hãy tóm tắt ý chính của lời nhắn người dùng thành đúng 1 tiêu đề ngắn gồm 2 đến 4 từ tiếng Việt.

QUY TẮC BẮT BUỘC:
- Lời nhắn chào hỏi ("hello", "hi", "chào bác sĩ") -> Đặt tên: "Lời chào ban đầu" hoặc "Chào hỏi & Bắt đầu".
- Lời nhắn về tuổi/hành chính ("tôi 22 tuổi") -> Đặt tên: "Tư vấn tuổi & sức khỏe".
- Lời nhắn chứa triệu chứng -> Đặt tên dạng "Tư vấn + triệu chứng" hoặc "Đánh giá + triệu chứng" (Ví dụ: "Tư vấn sốt & đau họng", "Đánh giá đau bụng cấp", "Tư vấn mẩn ngứa da"). KHÔNG dùng từ "Chẩn đoán".
- Lời nhắn về chủ đề khác -> Đặt tên chủ đề ngắn gọn (Ví dụ: "Hướng dẫn thanh toán", "Hỏi đáp thuốc hạ sốt").
- KHÔNG BAO GIỜ đặt tên là "Cuộc trò chuyện mới".
- CHỈ TRẢ VỀ DUY NHẤT CỤM TỪ TIÊU ĐỀ, KHÔNG THÊM CẶP NGOẶC HAY TỪ DẪN.`

      const rawTitle = await callLLM({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: cleanInput }
        ],
        model: env.openrouterModel,
        stream: false,
        maxTokens: 25,
        timeoutMs: 15000
      })

      let title = rawTitle?.trim()?.replace(/^["'«»“`]+|["'«»”`]+$/g, '')
      if (title) {
        title = title
          .replace(/^chẩn đoán/i, isEn ? 'Consultation' : 'Tư vấn')
          .replace(/^dự đoán/i, isEn ? 'Screening' : 'Sàng lọc')
          .replace(/^diagnosis/i, 'Consultation')
        if (title.length >= 2 && title.length <= 50) {
          return title
        }
      }
    } catch (err) {
      auditLog('SmartTitle', 'Error', `Error calling LLM for title: ${err.message}`, 'warn')
    }
  }

  // 2. FALLBACK HEURISTIC KHI KHÔNG CÓ KẾT NỐI API HOẶC XẢY RA LỖI
  const lower = cleanInput.toLowerCase()
  if (lower.includes('hello') || lower.includes('hi') || lower.includes('chào')) {
    return isEn ? 'Initial Greeting' : 'Lời chào ban đầu'
  }
  if ((lower.includes('đau họng') || lower.includes('amidan') || lower.includes('rát họng') || lower.includes('sore throat')) && (lower.includes('sốt') || lower.includes('fever'))) {
    return isEn ? 'Consultation: Sore Throat & Fever' : 'Tư vấn sốt & đau họng'
  }
  if (lower.includes('amidan') || lower.includes('đau họng') || lower.includes('rát họng') || lower.includes('sore throat')) {
    return isEn ? 'Consultation: Sore Throat' : 'Tư vấn đau rát họng'
  }
  if ((lower.includes('đau bụng') || lower.includes('abdominal pain')) && (lower.includes('hố chậu') || lower.includes('ruột thừa') || lower.includes('appendicitis'))) {
    return isEn ? 'Evaluation: Acute Abdomen' : 'Đánh giá đau bụng cấp'
  }
  if (lower.includes('đau bụng') || lower.includes('dạ dày') || lower.includes('stomach') || lower.includes('abdominal')) {
    return isEn ? 'Consultation: Abdominal Symptoms' : 'Tư vấn triệu chứng đau bụng'
  }
  if (lower.includes('đau đầu') || lower.includes('thái dương') || lower.includes('migraine') || lower.includes('headache')) {
    return isEn ? 'Consultation: Headache Symptoms' : 'Tư vấn triệu chứng đau đầu'
  }
  if (lower.includes('sốt') || lower.includes('fever')) {
    return isEn ? 'Consultation: Fever Symptoms' : 'Tư vấn triệu chứng sốt'
  }

  const words = cleanInput.split(/\s+/).slice(0, 4).join(' ')
  return words.length <= 30 ? words : `${words.slice(0, 27)}…`
}
