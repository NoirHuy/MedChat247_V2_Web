import { env } from '../../config/env.js'
import { auditLog } from '../../utils/auditLog.js'
import { callLLMWithFailover } from '../llm/llmClient.js'
import { searchUMLS } from './umlsClient.js'
import { vectorSearchSymptom, isVectorIndexReady } from './symptomVectorIndex.js'

export function tryRepairJson(jsonStr) {
  try {
    return JSON.parse(jsonStr)
  } catch {
    auditLog('JSON_REPAIR', 'Attempting to repair truncated JSON...')
    let clean = jsonStr.trim()
    const symptomsIndex = clean.lastIndexOf('symptoms')
    if (symptomsIndex === -1) return null

    for (let i = clean.length - 1; i >= 0; i--) {
      if (clean[i] === '}') {
        const testSub = clean.substring(0, i + 1)
        const testClean = testSub.replace(/,\s*$/, '').trim()
        const testJson = testClean + '\n]\n}'
        try {
          const parsed = JSON.parse(testJson)
          auditLog('JSON_REPAIR', 'Success', 'Repaired truncated JSON successfully!')
          return parsed
        } catch {
          /* continue search */
        }
      }
    }
    return null
  }
}

export function normalizeSymptomTerm(sym) {
  return sym.term
}

export async function extractSCEFromConversation(messages, isEn = false) {
  const formattedHistory = messages
    .map(m => `${m.role === 'user' ? (isEn ? 'Patient' : 'Bệnh nhân') : (isEn ? 'Doctor' : 'Bác sĩ')}: ${m.content}`)
    .join('\n')

  const translationPrompt = isEn ? `You are a professional medical assistant and a clinical entity extraction expert (Clinical NER).
Analyze the conversation history between the Doctor and the Patient below to extract structured clinical information in Structured Clinical Extraction (SCE) format.

Output Format:
You MUST return ONLY a single valid JSON block matching the following structure (Do not add any markdown comments, reasoning text, or extra characters outside of this JSON):

{
  "demographics": {
    "age": <patient's age as a number, e.g. 22, or null if not mentioned>,
    "sex": <"male" | "female" | null>
  },
  "temporal": {
    "durationValue": <number representing symptom duration, e.g. 2, or null>,
    "durationUnit": <"hours" | "days" | "weeks" | "months" | null>,
    "onset": <"acute" (e.g. hours/days) | "subacute" | "chronic" (e.g. weeks/months) | null>
  },
  "symptoms": [
    {
      "term": "<atomic or composite clinical symptom term in English, e.g. 'Lower abdominal pain', 'Nausea'>",
      "status": "<'positive' if the patient confirms this symptom | 'negative' if the patient denies this symptom>",
      "role": "<'chief_complaint' if this is the primary reason for the medical visit | 'associated' if it is a secondary symptom>",
      "confidenceScore": <your extraction confidence score from 0.0 to 1.0>,
      "attributes": {
        "severity": "<'mild' | 'moderate' | 'severe' | null>",
        "frequency": "<'constant' | 'episodic' | null>",
        "progression": "<'improving' | 'stable' | 'worsening' | null>",
        "bodyLocation": "<specific anatomical location, e.g. 'lower abdomen', 'epigastrium', or null>",
        "exacerbatingFactors": <array of strings representing things that worsen the symptom, e.g. ["movement", "pressure"], or []>,
        "relievingFactors": <array of strings representing things that relieve the symptom, e.g. ["rest", "lying down"], or []>
      }
    }
  ]
}

Mandatory Clinical NLP Rules:
1. Clinical Representation & No Disease Inference: Extract clinical symptoms accurately. Do NOT infer clinical diseases (e.g. do not output Tension headache, as disease classification belongs to the graph reasoning layer).
2. Negation Detection: Extract negated symptoms mentioned by the patient. If the patient says "no vomiting", output term: "Vomiting", status: "negative".
3. Strict Explicit Mention Rule (Critical): ONLY extract symptoms that the Patient explicitly mentions as present or absent. If the Doctor asks about a symptom (e.g., "Do you have a cough, runny nose, or chest pain?") but the Patient ignores it or does NOT answer it, you MUST NOT extract it. Do NOT assume it is negative. Only output status "negative" when the Patient explicitly denies it (e.g., "no cough", "không ho").
4. Hybrid Chief Complaint: The first symptom reported by the Patient in their first turn is the highest priority candidate. Verify if it is indeed the main reason for visit to set role: "chief_complaint". Mark subsequent symptoms as "associated".
5. Composite Symptom Terms: When a body location, severity, or frequency drastically changes the clinical classification of a symptom, you MUST generate a composite clinical term in the "term" field (in English). For example:
   - If abdominal pain is located in the 'lower abdomen' or 'hypogastric region', map "term" directly to 'Lower abdominal pain'.
   - If abdominal pain is located in the 'upper abdomen' or 'epigastrium', map "term" directly to 'Upper abdominal pain'.
   - If abdominal pain is 'burning', map "term" directly to 'Burning abdominal pain'.
   - If abdominal pain is 'sharp' or 'severe', map "term" directly to 'Sharp abdominal pain'.
   - Similarly, map 'Chest pain' + 'sharp' to 'Sharp chest pain', and 'Back pain' + 'low' to 'Low back pain'. Keep the attributes populated, but make sure the main "term" contains the composite description.

Clinical Conversation:
${formattedHistory}

JSON Output:` : `Bạn là trợ lý y khoa chuyên nghiệp và là chuyên gia trích xuất thực thể (Clinical NER).
Hãy phân tích toàn bộ cuộc hội thoại giữa Bác sĩ (Doctor) và Bệnh nhân (Patient) dưới đây để trích xuất thông tin lâm sàng chuẩn hóa theo mô hình Structured Clinical Extraction (SCE).

Yêu cầu định dạng đầu ra:
Bạn CHỈ được phép trả về duy nhất một khối JSON hợp lệ theo cấu trúc mẫu sau (Không viết thêm bất kỳ văn bản giải thích hay ký tự nào khác bên ngoài khối JSON này):

{
  "demographics": {
    "age": <số tuổi của bệnh nhân, ví dụ: 22, hoặc null nếu không nhắc tới>,
    "sex": <"male" | "female" | null>
  },
  "temporal": {
    "durationValue": <số thời gian kéo dài triệu chứng, ví dụ: 2, hoặc null>,
    "durationUnit": <"hours" | "days" | "weeks" | "months" | null>,
    "onset": <"acute" (cấp tính, ví dụ: vài giờ/vài ngày) | "subacute" (bán cấp) | "chronic" (mãn tính, vài tuần/vài tháng) | null>
  },
  "symptoms": [
    {
      "term": "<tên triệu chứng lâm sàng đơn lẻ hoặc từ ghép bằng tiếng Anh, ví dụ: 'Lower abdominal pain', 'Nausea'>",
      "status": "<'positive' nếu bệnh nhân xác nhận có triệu chứng này | 'negative' nếu bệnh nhân phủ nhận triệu chứng này>",
      "role": "<'chief_complaint' nếu đây là triệu chứng chính/lý do khám y khoa chính | 'associated' nếu đây là triệu chứng đi kèm>",
      "confidenceScore": <mức độ tự tin (confidence score) của bạn về việc trích xuất thực thể này từ 0.0 đến 1.0>,
       "attributes": {
        "severity": "<'mild' | 'moderate' | 'severe' | null>",
        "frequency": "<'constant' | 'episodic' | null>",
        "progression": "<'improving' | 'stable' | 'worsening' | null>",
        "bodyLocation": "<vị trí giải phẫu cụ thể, ví dụ: 'occipital region', 'epigastrium', hoặc null>",
        "exacerbatingFactors": <danh sách chuỗi các yếu tố làm triệu chứng nặng lên, ví dụ: ["movement", "pressure"], hoặc []>,
        "relievingFactors": <danh sách chuỗi các yếu tố làm giảm nhẹ triệu chứng, ví dụ: ["rest", "lying down"], hoặc []>
      }
    }
  ]
}

Nguyên tắc lâm sàng bắt buộc (Clinical NLP Rules):
1. Tách biệt trích xuất và suy luận: Bạn chỉ trích xuất triệu chứng lâm sàng. TUYỆT ĐỐI không tự suy diễn bệnh lý (ví dụ: cấm quy đổi thành Tension headache, vì chẩn đoán bệnh là của tầng suy luận đồ thị).
2. Phủ định (Negation): Phải trích xuất đầy đủ triệu chứng phủ định. Nếu bệnh nhân nói "không nôn, không buồn nôn", bạn phải ghi nhận term: "Nausea" và "Vomiting" với status: "negative".
3. Quy tắc chỉ trích xuất khi được đề cập (Cực kỳ quan trọng): Chỉ trích xuất các triệu chứng mà Bệnh nhân thực sự đề cập (có hoặc không có). Nếu Bác sĩ hỏi về một triệu chứng (Ví dụ: "Bé có ho hay chảy mũi không?") nhưng Bệnh nhân im lặng hoặc KHÔNG nhắc gì đến nó trong phản hồi, bạn TUYỆT ĐỐI KHÔNG được trích xuất triệu chứng đó và không được coi nó là "negative". Chỉ gán "status: 'negative'" khi Bệnh nhân chủ động phủ nhận (Ví dụ: "không ho", "không nôn", "không phát ban").
4. Xác định Chief Complaint lai: Triệu chứng đầu tiên mà Bệnh nhân khai báo trong lượt thoại đầu tiên là ứng viên ưu tiên cao nhất làm Chief Complaint. Bạn hãy kiểm tra xem đó có đúng là lý do chính khiến bệnh nhân đi khám không để gán role: "chief_complaint". Tất cả các triệu chứng phụ phát hiện sau đó gán role: "associated".
5. Từ triệu chứng ghép (Composite Terms): Khi vị trí cơ thể, tính chất, hoặc mức độ làm thay đổi bản chất chẩn đoán của triệu chứng, bạn BẮT BUỘC phải tạo ra một thuật ngữ triệu chứng ghép hoàn chỉnh trong trường "term" (bằng tiếng Anh). Ví dụ:
   - Nếu đau bụng ở vùng bụng dưới ('lower abdomen' hoặc 'hypogastric region'), hãy gán "term" trực tiếp là 'Lower abdominal pain'.
   - Nếu đau bụng ở vùng bụng trên hoặc thượng vị ('upper abdomen' hoặc 'epigastrium'), hãy gán "term" trực tiếp là 'Upper abdominal pain'.
   - Nếu đau bụng có tính chất nóng rát, hãy gán "term" trực tiếp là 'Burning abdominal pain'.
   - Nếu đau bụng quặn, dữ dội, hãy gán "term" trực tiếp là 'Sharp abdominal pain'.
   - Tương tự, nếu đau ngực dữ dội, gán "term" trực tiếp là 'Sharp chest pain'. Đau lưng dưới gán "term" trực tiếp là 'Low back pain'. Hãy giữ nguyên các thuộc tính con ở attributes, nhưng đảm bảo term chính là từ ghép hoàn chỉnh chuẩn y khoa.

Hội thoại lâm sàng:
${formattedHistory}

Kết quả JSON:`

  const rawTranslation = await callLLMWithFailover({
    messages: [
      { role: 'system', content: isEn ? 'You are a medical extraction robot that only returns valid JSON.' : 'Bạn là robot trích xuất y khoa chỉ trả về định dạng JSON hợp lệ.' },
      { role: 'user', content: translationPrompt }
    ],
    model: env.openrouterModelNer
  })

  auditLog('LLM_TRANSLATION', 'Raw', rawTranslation)

  let cleanJson = rawTranslation.replace(/```json/g, '').replace(/```/g, '').trim()
  cleanJson = cleanJson.replace(/\/\/.*$/gm, '')
  cleanJson = cleanJson.replace(/,\s*([\]}])/g, '$1')

  const extractedPayload = tryRepairJson(cleanJson)
  if (!extractedPayload) {
    throw new Error('Chuỗi JSON không thể phục hồi hoặc phân tích cú pháp.')
  }
  auditLog('LLM_TRANSLATION', 'Success', 'Parsed SCE JSON successfully.')
  return extractedPayload
}

export async function matchSymptomsToGraph(extractedSymptoms, symptomsList) {
  const finalSymptoms = []
  const unmatchedTerms = []

  const cuiToIdMap = new Map()
  const nameToIdMap = new Map()
  const idToIdMap = new Map()

  for (const s of symptomsList) {
    if (s.cui) cuiToIdMap.set(s.cui.toLowerCase(), s.id)
    nameToIdMap.set(s.name.toLowerCase(), s.id)
    idToIdMap.set(s.id.toLowerCase(), s.id)
  }

  const umlsResults = await Promise.all(
    extractedSymptoms.map(async (sym) => {
      const queryTerm = normalizeSymptomTerm(sym)
      auditLog('UMLS_SEARCH', 'Start', `Querying UMLS parallel for term: "${queryTerm}" (Original: "${sym.term}")`)
      try {
        const results = await searchUMLS(queryTerm)
        let umlsCui = null
        let umlsName = null
        if (results && results.length > 0) {
          umlsCui = results[0].ui
          umlsName = results[0].name
          auditLog('UMLS_SEARCH', 'Success', `Term: "${queryTerm}" -> Match: "${umlsName}" (CUI: ${umlsCui})`)
        } else {
          auditLog('UMLS_SEARCH', 'Warning', `No UMLS results for term: "${queryTerm}"`, 'warn')
        }
        return { sym, umlsCui, umlsName }
      } catch (err) {
        auditLog('UMLS_SEARCH', 'Warning', `UMLS search failed for "${queryTerm}": ${err.message}`, 'warn')
        return { sym, umlsCui: null, umlsName: null }
      }
    })
  )

  for (const { sym, umlsCui, umlsName } of umlsResults) {
    if (sym.confidenceScore < env.confidenceThreshold) {
      auditLog('LLM_TRANSLATION', 'Warning', `Low extraction confidence (${sym.confidenceScore}) for term: "${sym.term}"`, 'warn')
    }

    let matchedSymptomId = null

    if (umlsCui && cuiToIdMap.has(umlsCui.toLowerCase())) {
      matchedSymptomId = cuiToIdMap.get(umlsCui.toLowerCase())
      auditLog('NEO4J_QUERY', 'Success', `CUI Match: "${sym.term}" -> mapped via CUI ${umlsCui} to Neo4j Symptom: "${matchedSymptomId}"`)
    } else {
      const termLower = sym.term.toLowerCase()
      const cleanTerm = termLower.replace(/_/g, '-').replace(/\s+/g, '-')

      if (nameToIdMap.has(termLower)) {
        matchedSymptomId = nameToIdMap.get(termLower)
        auditLog('NEO4J_QUERY', 'Success', `Text Match: "${sym.term}" -> mapped via exact name to Neo4j Symptom: "${matchedSymptomId}"`)
      } else if (idToIdMap.has(cleanTerm)) {
        matchedSymptomId = idToIdMap.get(cleanTerm)
        auditLog('NEO4J_QUERY', 'Success', `Text Match: "${sym.term}" -> mapped via clean slug to Neo4j Symptom: "${matchedSymptomId}"`)
      } else if (umlsName && nameToIdMap.has(umlsName.toLowerCase())) {
        matchedSymptomId = nameToIdMap.get(umlsName.toLowerCase())
        auditLog('NEO4J_QUERY', 'Success', `Text Match: "${sym.term}" -> mapped via UMLS name "${umlsName}" to Neo4j Symptom: "${matchedSymptomId}"`)
      }
    }

    if (matchedSymptomId) {
      const matchedNode = symptomsList.find(s => s.id === matchedSymptomId)
      finalSymptoms.push({
        symptomId: matchedSymptomId,
        name: matchedNode ? matchedNode.name : sym.term,
        cui: umlsCui,
        status: sym.status || 'positive',
        role: sym.role || 'associated',
        confidenceScore: sym.confidenceScore || 1.0,
        attributes: {
          severity: sym.attributes?.severity || null,
          frequency: sym.attributes?.frequency || null,
          progression: sym.attributes?.progression || null,
          bodyLocation: sym.attributes?.bodyLocation || null,
          exacerbatingFactors: sym.attributes?.exacerbatingFactors || [],
          relievingFactors: sym.attributes?.relievingFactors || []
        }
      })
    } else {
      unmatchedTerms.push({ ...sym, umlsCui, umlsName })
    }
  }

  return { finalSymptoms, unmatchedTerms }
}

// ─── VECTOR SEARCH (replaces LLM fallback for known medical terms) ────────────
export async function vectorMatchUnmatched(unmatchedTerms, finalSymptoms) {
  if (!unmatchedTerms || unmatchedTerms.length === 0) return { resolved: [], stillUnmatched: [] }
  if (!isVectorIndexReady()) return { resolved: [], stillUnmatched: unmatchedTerms }

  const stillUnmatched = []
  const resolved = []

  for (const item of unmatchedTerms) {
    // Build rich query: use UMLS name if available for better embedding quality
    const queryText = item.umlsName ? `${item.term} (${item.umlsName})` : item.term
    const result = await vectorSearchSymptom(queryText)

    if (result) {
      const { symptom, similarity } = result
      // Skip if this symptomId is already in finalSymptoms
      if (!finalSymptoms.some(s => s.symptomId === symptom.id)) {
        finalSymptoms.push({
          symptomId: symptom.id,
          name: symptom.name,
          cui: item.umlsCui || symptom.cui,
          status: item.status || 'positive',
          role: item.role || 'associated',
          confidenceScore: parseFloat(similarity.toFixed(4)),
          attributes: {
            severity: item.attributes?.severity || null,
            frequency: item.attributes?.frequency || null,
            progression: item.attributes?.progression || null,
            bodyLocation: item.attributes?.bodyLocation || null,
            exacerbatingFactors: item.attributes?.exacerbatingFactors || [],
            relievingFactors: item.attributes?.relievingFactors || []
          }
        })
        auditLog('VECTOR_SEARCH', 'Success', `"${item.term}" → "${symptom.id}" (similarity: ${similarity.toFixed(4)})`)
        resolved.push(item)
      } else {
        auditLog('VECTOR_SEARCH', 'Skip', `"${item.term}" matched "${symptom.id}" but already in finalSymptoms`)
        resolved.push(item)
      }
    } else {
      auditLog('VECTOR_SEARCH', 'Miss', `"${item.term}" — no symptom above threshold, deferring to LLM Fallback`, 'warn')
      stillUnmatched.push(item)
    }
  }

  return { resolved, stillUnmatched }
}

export async function fallbackMatchUnmatched(unmatchedTerms, symptomsList, finalSymptoms) {
  if (!unmatchedTerms || unmatchedTerms.length === 0) return finalSymptoms

  auditLog('LLM_TRANSLATION', 'Fallback', `Triggering LLM Fallback for ${unmatchedTerms.length} unmatched terms.`)
  const unmatchedDetails = unmatchedTerms.map(u =>
    u.umlsCui ? `Term: "${u.term}" (UMLS Name: "${u.umlsName}", CUI: ${u.umlsCui})` : `Term: "${u.term}" (No UMLS CUI)`
  ).join('\n')

  const availableSlugs = symptomsList.map(s => s.id)

  const verificationPrompt = `Bạn là hệ thống ánh xạ thực thể y học lâm sàng. 
Nhiệm vụ: Dựa trên các triệu chứng chưa khớp được và kết quả UMLS dưới đây, hãy lựa chọn các slug triệu chứng phù hợp nhất từ danh sách cơ sở dữ liệu SymCAT.

Các triệu chứng chưa khớp:
${unmatchedDetails}

Danh sách các slug SymCAT được phép chọn (Chọn đúng slug trong danh sách dưới đây, ngăn cách bằng dấu phẩy. Không tự ý bịa slug khác):
${availableSlugs.slice(0, 300).join(', ')}
${availableSlugs.slice(300).join(', ')}

Chỉ trả về danh sách các slug khớp chính xác nhất từ danh sách trên (ví dụ: "cough, back-pain"). Nếu không có triệu chứng nào khớp, trả về "none".`

  const verifiedRaw = await callLLMWithFailover({
    messages: [
      { role: 'system', content: 'Bạn là chuyên viên chuẩn hóa y khoa. Chỉ trả về danh sách các slug hợp lệ ngăn cách bằng dấu phẩy.' },
      { role: 'user', content: verificationPrompt }
    ],
    model: env.openrouterModelNer
  })

  if (verifiedRaw && !verifiedRaw.toLowerCase().includes('none')) {
    const verifiedSlugs = verifiedRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    auditLog('LLM_TRANSLATION', 'Fallback', `Mapped slugs: ${verifiedSlugs.join(', ')}`)

    verifiedSlugs.forEach(slug => {
      const matchedSymptom = symptomsList.find(s => s.id.toLowerCase() === slug)
      if (matchedSymptom) {
        const originalItem = unmatchedTerms.find(u => u.term.toLowerCase() === slug.replace(/-/g, ' ') || u.term.toLowerCase() === slug) || {}
        if (!finalSymptoms.some(s => s.symptomId === matchedSymptom.id)) {
          finalSymptoms.push({
            symptomId: matchedSymptom.id,
            name: matchedSymptom.name,
            cui: matchedSymptom.cui,
            status: originalItem.status || 'positive',
            role: originalItem.role || 'associated',
            confidenceScore: originalItem.confidenceScore || 0.8,
            attributes: {
              severity: originalItem.attributes?.severity || null,
              frequency: originalItem.attributes?.frequency || null,
              progression: originalItem.attributes?.progression || null,
              bodyLocation: originalItem.attributes?.bodyLocation || null,
              exacerbatingFactors: originalItem.attributes?.exacerbatingFactors || [],
              relievingFactors: originalItem.attributes?.relievingFactors || []
            }
          })
        }
      }
    })
  }
  return finalSymptoms
}

export function applyChiefComplaintRule(finalSymptoms) {
  let hasChiefComplaint = finalSymptoms.some(s => s.role === 'chief_complaint' && s.status === 'positive')
  if (!hasChiefComplaint && finalSymptoms.length > 0) {
    const firstPositive = finalSymptoms.find(s => s.status === 'positive')
    if (firstPositive) {
      firstPositive.role = 'chief_complaint'
      auditLog('BAYESIAN_REASONING', 'Rule', `Hybrid CC Rule: Promoted "${firstPositive.symptomId}" to chief_complaint.`)
    }
  }
  return finalSymptoms
}

export async function extractSymptomsFromHistory(messages, symptomsList, lang = 'vi') {
  const emptySCE = {
    demographics: { age: null, sex: null },
    temporal: { durationValue: null, durationUnit: null, onset: null },
    symptoms: []
  }

  if (!messages || messages.length === 0) return emptySCE

  const isEn = lang === 'en'

  let extractedPayload = null
  try {
    extractedPayload = await extractSCEFromConversation(messages, isEn)
  } catch (err) {
    auditLog('LLM_TRANSLATION', 'Error', `JSON extraction failed: ${err.message}`, 'error')
    return emptySCE
  }

  const extractedSymptoms = extractedPayload.symptoms || []
  const { finalSymptoms, unmatchedTerms } = await matchSymptomsToGraph(extractedSymptoms, symptomsList)

  let stillUnmatched = unmatchedTerms

  // ── STEP 1: Vector similarity search (deterministic, 0 LLM calls) ──────────
  if (stillUnmatched.length > 0) {
    try {
      const { stillUnmatched: remaining } = await vectorMatchUnmatched(stillUnmatched, finalSymptoms)
      stillUnmatched = remaining
    } catch (err) {
      auditLog('VECTOR_SEARCH', 'Error', `Vector matching failed: ${err.message}`, 'error')
    }
  }

  // ── STEP 2: LLM Fallback (only for terms still unmatched after vector search) ─
  if (stillUnmatched.length > 0) {
    try {
      await fallbackMatchUnmatched(stillUnmatched, symptomsList, finalSymptoms)
    } catch (err) {
      auditLog('LLM_TRANSLATION', 'Error', `Fallback LLM mapping failed: ${err.message}`, 'error')
    }
  }

  // ── STEP 3: Clinical Implication Expansion (Auto-expand core parent symptoms) ──
  const hasSymptom = (id) => finalSymptoms.some(s => s.symptomId === id && s.status === 'positive')
  const addSymptomIfMissing = (id, name, role = 'associated') => {
    if (!hasSymptom(id)) {
      finalSymptoms.push({
        symptomId: id,
        name: name,
        cui: null,
        status: 'positive',
        role: role,
        confidenceScore: 0.9,
        attributes: {}
      })
    }
  }

  // If coughing-up-sputum is present -> auto-expand base 'cough'
  if (hasSymptom('coughing-up-sputum')) {
    addSymptomIfMissing('cough', 'Cough', 'chief_complaint')
  }

  // If heartburn or burning-chest-pain is present -> auto-expand 'gastroesophageal-reflux' & 'heartburn'
  if (hasSymptom('heartburn') || hasSymptom('burning-chest-pain')) {
    addSymptomIfMissing('gastroesophageal-reflux', 'Gastroesophageal reflux', 'chief_complaint')
    addSymptomIfMissing('heartburn', 'Heartburn', 'chief_complaint')
  }

  applyChiefComplaintRule(finalSymptoms)

  return {
    demographics: extractedPayload.demographics || { age: null, sex: null },
    temporal: extractedPayload.temporal || { durationValue: null, durationUnit: null, onset: null },
    symptoms: finalSymptoms
  }
}
