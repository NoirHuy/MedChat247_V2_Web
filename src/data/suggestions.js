export const SUGGESTIONS = [
  {
    id: 'disease_1',
    title: {
      vi: 'Viêm Họng Cấp',
      en: 'Acute Pharyngitis'
    },
    detail: {
      vi: 'Sốt 38°C, đau rát họng khi nuốt, họng sưng tấy, đau nhức mệt mỏi',
      en: '38°C fever, severe sore throat, painful swallowing, throat swelling'
    },
    prompt: {
      vi: 'Tôi là nam 28 tuổi, bị sốt 38°C kèm đau rát họng dữ dội khi nuốt 2 ngày nay, họng sưng tấy, đau nhức vùng cổ họng và mệt mỏi toàn thân. Hãy phân tích dự đoán khả năng và hướng dẫn cách điều trị, xử lý giúp tôi.',
      en: 'I am a 28-year-old male with a 38°C fever, severe sore throat, and painful swallowing for 2 days. Please evaluate potential possibilities and provide treatment guidance.'
    },
  },
  {
    id: 'disease_2',
    title: {
      vi: 'Trào Ngược Dạ Dày (GERD)',
      en: 'Acid Reflux (GERD)'
    },
    detail: {
      vi: 'Ợ chua, trào ngược axit, đau rát đằng sau xương ức, buồn nôn, đắng miệng',
      en: 'Heartburn, acid regurgitation, chest heat, nausea'
    },
    prompt: {
      vi: 'Tôi là nữ 32 tuổi, hay bị ợ chua, trào ngược axit gây đau rát đằng sau xương ức sau khi ăn no hoặc nằm ngửa, kèm cảm giác buồn nôn và đắng miệng vào buổi sáng. Hãy phân tích dự đoán khả năng và hướng dẫn cách điều trị, xử lý giúp tôi.',
      en: 'I am a 32-year-old female with acid reflux, heartburn after meals, and nausea. Please evaluate potential possibilities and provide treatment guidance.'
    },
  },
  {
    id: 'disease_3',
    title: {
      vi: 'Viêm Xoang Cấp & Mãn Tính',
      en: 'Sinusitis (Sinus Infection)'
    },
    detail: {
      vi: 'Đau nhức vùng trán/gò má, nghẹt mũi kéo dài, đờm xanh đặc',
      en: 'Facial pressure, nasal congestion, thick yellow-green mucus'
    },
    prompt: {
      vi: 'Tôi là nam 35 tuổi, bị đau nhức nặng vùng trán và hai bên gò má khi cúi đầu, nghẹt mũi kéo dài, chảy dịch mũi đặc màu vàng xanh và giảm khứu giác 5 ngày nay. Hãy phân tích dự đoán khả năng và hướng dẫn cách điều trị, xử lý giúp tôi.',
      en: 'I am a 35-year-old male with facial pressure on my forehead/cheeks when bending over, thick yellow-green nasal discharge, and congestion for 5 days. Please evaluate potential possibilities and provide clear treatment guidance.'
    },
  },
  {
    id: 'disease_4',
    title: {
      vi: 'Viêm Phế Quản',
      en: 'Acute Bronchitis'
    },
    detail: {
      vi: 'Ho khạc đờm đặc liên tục, rát phế quản, tức ngực khi ho, sốt nhẹ 37.8°C',
      en: 'Persistent productive cough, bronchial soreness, chest tightness, mild fever'
    },
    prompt: {
      vi: 'Tôi là nữ 26 tuổi, bị ho khạc đờm đặc liên tục 3 ngày nay, ho rát phế quản và tức ngực mỗi khi ho, kèm sốt nhẹ 37.8°C và thở khò khè nhẹ. Hãy phân tích dự đoán khả năng và hướng dẫn cách điều trị, xử lý giúp tôi.',
      en: 'I am a 26-year-old female with persistent productive cough with thick sputum, bronchial soreness, chest tightness when coughing, 37.8°C fever for 3 days. Please evaluate potential possibilities and provide clear treatment guidance.'
    },
  },
]

export const NUTRITION_SUGGESTIONS = [
  {
    id: 'nutri_1',
    title: {
      vi: 'Tiểu Đường & Chè Thái',
      en: 'Diabetes & Sweet Desserts'
    },
    detail: {
      vi: 'Phân tích chỉ số Carb, đường đơn và nguy cơ đường huyết',
      en: 'Carb and sugar evaluation for diabetes'
    },
    prompt: {
      vi: 'Tôi bị tiểu đường type 2 thì ăn chè thái được không và cần lưu ý gì?',
      en: 'I have type 2 diabetes, can I eat sweet Thai dessert?'
    },
  },
  {
    id: 'nutri_2',
    title: {
      vi: 'Tăng Huyết Áp & Bún Mắm',
      en: 'Hypertension & Salty Foods'
    },
    detail: {
      vi: 'Kiểm tra hàm lượng Natri, muối và mức an toàn tim mạch',
      en: 'Sodium and cardiovascular safety analysis'
    },
    prompt: {
      vi: 'Tôi bị tăng huyết áp thì ăn bún mắm có an toàn không?',
      en: 'Can I eat fermented fish noodle soup with hypertension?'
    },
  },
  {
    id: 'nutri_3',
    title: {
      vi: 'Bệnh Gout & Thịt Bò Xào Nấm',
      en: 'Gout & Purine Content'
    },
    detail: {
      vi: 'Phân tích hàm lượng Purine, Acid Uric và gợi ý món thay thế',
      en: 'Purine content and safe alternatives'
    },
    prompt: {
      vi: 'Người bị bệnh Gout ăn món thịt bò xào nấm có sao không?',
      en: 'Is beef stir-fried with mushrooms safe for gout patients?'
    },
  },
  {
    id: 'nutri_4',
    title: {
      vi: 'Tra Cứu Vi Chất Phở Bò',
      en: 'Beef Pho Nutrient Lookup'
    },
    detail: {
      vi: 'Tra cứu chi tiết Calo, Đạm, Béo, Natri, Canxi, Sắt theo 100g/tô',
      en: 'Calories, protein, fat, sodium per bowl'
    },
    prompt: {
      vi: 'Cho tôi biết thành phần dinh dưỡng và các vi chất có trong một tô Phở bò.',
      en: 'Tell me the nutrition and micronutrients in a bowl of beef pho.'
    },
  },
]

export const GENERAL_SUGGESTIONS = [
  {
    id: 'gen_1',
    title: {
      vi: 'Tư Vấn Lâm Sàng & Lối Sống',
      en: 'Clinical Care & Lifestyle'
    },
    detail: {
      vi: 'Bệnh nhân 52 tuổi mới phát hiện Đái tháo đường type 2 (HbA1c 7.8%)',
      en: '52-year-old male newly diagnosed with Type 2 Diabetes (HbA1c 7.8%)'
    },
    prompt: {
      vi: 'Bệnh nhân nam 52 tuổi mới được chẩn đoán Đái tháo đường type 2 (HbA1c 7.8%). Các biện pháp can thiệp lối sống chính và khuyến nghị dùng thuốc ban đầu là gì?',
      en: 'A 52-year-old male is newly diagnosed with Type 2 Diabetes (HbA1c 7.8%). What are the primary lifestyle interventions and first-line pharmacological recommendations?'
    },
  },
  {
    id: 'gen_2',
    title: {
      vi: 'Bệnh Học & Dược Lý',
      en: 'Pathophysiology & Pharmacology'
    },
    detail: {
      vi: 'Cơ chế tác dụng thuốc ức chế men chuyển ACEi & phản ứng ho khan',
      en: 'ACE inhibitors mechanism and dry cough management'
    },
    prompt: {
      vi: 'Hãy giải thích cơ chế tác dụng của nhóm thuốc ức chế men chuyển (ACE inhibitors) và tại sao chúng có thể gây ho khan ở một số bệnh nhân.',
      en: 'Explain the mechanism of action of ACE inhibitors and why they may cause a dry cough in some patients.'
    },
  },
  {
    id: 'gen_3',
    title: {
      vi: 'Chẩn Đoán Phân Biệt',
      en: 'Differential Diagnosis'
    },
    detail: {
      vi: 'Đau dữ dội đột ngột vùng thượng vị lan ra sau lưng kèm nôn ói',
      en: 'Sudden severe epigastric pain radiating to the back with nausea'
    },
    prompt: {
      vi: 'Một bệnh nhân có biểu hiện đau dữ dội đột ngột vùng thượng vị lan ra sau lưng, kèm buồn nôn và nôn. Các chẩn đoán phân biệt chính cần đánh giá là gì?',
      en: 'A patient presents with sudden severe epigastric pain radiating to the back, accompanied by nausea and vomiting. What are the key differential diagnoses to evaluate?'
    },
  },
  {
    id: 'gen_4',
    title: {
      vi: 'Đau Đầu Căng Thẳng & Mất Ngủ',
      en: 'Tension Headache & Insomnia'
    },
    detail: {
      vi: 'Đau ê ẩm như bó chặt vùng trán, thái dương, khó ngủ và stress',
      en: 'Tension headaches, sleep hygiene and stress management'
    },
    prompt: {
      vi: 'Tôi thường xuyên bị đau ê ẩm như bó chặt vùng trán và hai bên thái dương vào cuối ngày, kèm khó ngủ và uể oải. Xin bác sĩ hướng dẫn cách cải thiện và xử lý.',
      en: 'I often have a tight squeezing pain across my forehead and temples in the evening with insomnia and fatigue. Please advise on management and lifestyle adjustments.'
    },
  },
]

export function getSuggestions(specialtyId) {
  if (specialtyId === 'nutrition_consultation') {
    return NUTRITION_SUGGESTIONS
  }
  if (specialtyId === 'general_consultation') {
    return GENERAL_SUGGESTIONS
  }
  return SUGGESTIONS
}