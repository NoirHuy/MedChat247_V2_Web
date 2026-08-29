export function formatAdaptiveContext(ctx, lang = 'vi') {
  const { confirmedSymptoms, excludedSymptoms, rankedDiseases, bestNextSymptoms, sce } = ctx
  const isEn = lang === 'en'

  let text = isEn ? '## ADAPTIVE GRAPH CONTEXT (Current Turn)\n\n' : '## ADAPTIVE GRAPH CONTEXT (Cap nhat luot nay)\n\n'

  if (sce && sce.demographics) {
    const { age, sex } = sce.demographics
    if (age || sex) {
      if (isEn) {
        text += `**Patient demographics:** ${age ? `Age: ${age}` : ''}${age && sex ? ', ' : ''}${sex ? `Sex: ${sex}` : ''}\n`
      } else {
        text += `**Thong tin benh nhan:** ${age ? `Tuoi: ${age}` : ''}${age && sex ? ', ' : ''}${sex ? `Gioi tinh: ${sex}` : ''}\n`
      }
    }
  }

  if (sce && sce.temporal) {
    const { durationValue, durationUnit, onset } = sce.temporal
    if (durationValue || onset) {
      if (isEn) {
        text += `**Onset & Duration:** ${durationValue ? `${durationValue} ${durationUnit}` : ''}${durationValue && onset ? ' (' : ''}${onset ? `${onset}` : ''}${durationValue && onset ? ')' : ''}\n`
      } else {
        text += `**Thoi gian khoi phat:** ${durationValue ? `${durationValue} ${durationUnit}` : ''}${durationValue && onset ? ' (' : ''}${onset ? `${onset}` : ''}${durationValue && onset ? ')' : ''}\n`
      }
    }
  }

  if (confirmedSymptoms.length === 0) {
    if (isEn) {
      text += `**Status:** Conversation start — no symptoms confirmed yet. Politely invite the user to describe their current symptoms.\n\n`
    } else {
      text += `**Trang thai:** Dau hoi thoai — chua xac nhan trieu chung nao. Hay lich su moi nguoi dung chia se cac trieu chung hoac bieu hien bat thuong dang gap phai.\n\n`
    }
    return text
  }

  if (confirmedSymptoms.length > 0) {
    const positiveSymptomsSCE = sce ? sce.symptoms.filter(s => s.status === 'positive') : []
    if (positiveSymptomsSCE.length > 0) {
      const ccList = positiveSymptomsSCE.filter(s => s.role === 'chief_complaint').map(s => `${s.name} (Slug: ${s.symptomId}${s.attributes?.bodyLocation ? `, Location: ${s.attributes.bodyLocation}` : ''})`)
      const asList = positiveSymptomsSCE.filter(s => s.role !== 'chief_complaint').map(s => `${s.name} (Slug: ${s.symptomId})`)

      if (ccList.length > 0) {
        text += isEn ? `**Chief Complaint:** ${ccList.join(', ')}\n` : `**Trieu chung chinh (Chief Complaint):** ${ccList.join(', ')}\n`
      }
      if (asList.length > 0) {
        text += isEn ? `**Associated Symptoms:** ${asList.join(', ')}\n` : `**Trieu chung di kem (Associated Symptoms):** ${asList.join(', ')}\n`
      }
    } else {
      text += isEn ? `**Confirmed Symptoms (Standardized Slugs):** ${confirmedSymptoms.join(', ')}\n`
                   : `**Trieu chung da xac nhan (Standardized Slugs):** ${confirmedSymptoms.join(', ')}\n`
    }
  }

  if (excludedSymptoms.length > 0) {
    text += isEn ? `**Excluded Symptoms (Standardized Slugs):** ${excludedSymptoms.join(', ')}\n`
                 : `**Trieu chung da loai tru (Standardized Slugs):** ${excludedSymptoms.join(', ')}\n`
  }

  text += isEn ? `\n### Disease Ranking by Bayesian Score:\n` : `\n### Bang xep hang benh theo Bayesian Score:\n`

  if (rankedDiseases.length === 0) {
    text += isEn ? `*Not enough symptoms to rank diseases — please ask for more.*\n`
                 : `*Chua du trieu chung de xep hang benh — hay hoi them.*\n`
  } else {
    rankedDiseases.slice(0, 5).forEach((d, idx) => {
      const pct = d.pct !== undefined ? d.pct : Math.min(95, Math.max(5, Math.round((d.score / d.maxPossibleScore) * 100)))
      const symList = d.matchedDetails.map(s => `${s.symptom} (${s.prob.toFixed(1)}%${s.description ? ` - Desc: ${s.description}` : ''})`).join(', ')
      const ageInfo = d.ages.length > 0 ? (isEn ? ` | Common age: ` : ` | Tuoi pho bien: `) + d.ages.map(a => `${a.age} (${a.prob?.toFixed(1)}%)`).join(', ') : ''
      const sexInfo = d.sexes.length > 0 ? (isEn ? ` | Gender: ` : ` | Gioi tinh: `) + d.sexes.map(s => `${s.sex} (${s.prob?.toFixed(1)}%)`).join(', ') : ''

      text += `\n**${idx + 1}. ${d.name}** — Estimated Probability: ~${pct}%\n`
      if (d.description) text += isEn ? `   Medical description: ${d.description}\n` : `   Y khoa mo ta: ${d.description}\n`
      if (d.remarks) text += isEn ? `   Clinical stats: ${d.remarks}\n` : `   Thong ke lam sang: ${d.remarks}\n`
      text += isEn ? `   Matched symptoms: ${symList}${ageInfo}${sexInfo}\n` : `   Trieu chung khop: ${symList}${ageInfo}${sexInfo}\n`
    })
  }

  if (bestNextSymptoms && bestNextSymptoms.length > 0) {
    text += isEn ? `\n### Optimal Differential Symptoms (Clarification Suggested):\n`
                 : `\n### Trieu chung phan biet toi uu (goi y hoi tiep):\n`
    bestNextSymptoms.forEach(sym => {
      const breakdown = sym.byDisease
        .map(d => `${d.disease}: ${d.prob?.toFixed(1)}%`)
        .join(' vs ')
      const descText = sym.description ? ` - Desc: ${sym.description}` : ''
      text += `- **"${sym.name}"** (slug: ${sym.id}${descText}) — Probability gap between diseases: ${breakdown}\n`
    })
    text += isEn ? `-> Please ask the user about these symptoms to differentiate effectively.\n`
                 : `-> Hay hoi nguoi dung ve cac trieu chung nay de phan biet hieu qua nhat.\n`
  } else if (rankedDiseases.length > 0) {
    text += isEn ? `\n-> Adequate differential data collected. Please summarize the screening report.\n`
                 : `\n-> Da co du du lieu phan biet. Hay tong ket bao cao chan doan sang loc.\n`
  }

  return text
}
