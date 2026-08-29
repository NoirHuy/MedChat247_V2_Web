import { env } from '../../config/env.js'
import { getSession, getAllSymptoms, getDiseaseOverview } from './neo4jClient.js'
import { getPrevalenceBoost, computeTemporalMultiplier, findAgeGroup, computeDiseaseScore } from './scoring.js'

export async function computeAdaptiveContext(sceResult, excludedSymptoms = new Set()) {
  const session = getSession()

  let confirmedSymptomsSet = new Set()
  let excludedSymptomsSet = new Set()
  let demographics = { age: null, sex: null }
  let symptomsListSCE = []

  if (sceResult && typeof sceResult === 'object' && !(sceResult instanceof Set) && !Array.isArray(sceResult)) {
    demographics = sceResult.demographics || { age: null, sex: null }
    symptomsListSCE = sceResult.symptoms || []
    for (const sym of symptomsListSCE) {
      if (sym.status === 'positive') {
        confirmedSymptomsSet.add(sym.symptomId)
      } else if (sym.status === 'negative') {
        excludedSymptomsSet.add(sym.symptomId)
      }
    }
  } else {
    confirmedSymptomsSet = sceResult instanceof Set ? sceResult : new Set(sceResult || [])
    excludedSymptomsSet = excludedSymptoms instanceof Set ? excludedSymptoms : new Set(excludedSymptoms || [])
  }

  try {
    const allSymptoms = await getAllSymptoms(session)
    const allSymptomNames = allSymptoms.map(s => s.name)
    const symptomsArr = Array.from(confirmedSymptomsSet)
    const excludedArr = Array.from(excludedSymptomsSet)

    const symptomWeights = {}
    if (symptomsListSCE.length > 0) {
      for (const sym of symptomsListSCE) {
        if (sym.status === 'positive') {
          symptomWeights[sym.symptomId] = sym.role === 'chief_complaint'
            ? env.wChiefComplaint
            : env.wAssociated
        }
      }
    } else {
      symptomsArr.forEach(slug => {
        symptomWeights[slug] = 1.0
      })
    }

    let rankedDiseases = []

    if (symptomsArr.length > 0) {
      const diseaseRes = await session.run(`
        MATCH (d:Disease)-[r:HAS_SYMPTOM]->(s:Symptom)
        WITH d, collect({s_id: s.id, prob: r.probability, name: s.name, description: s.description}) AS all_symptoms
        WITH d, all_symptoms, [x IN all_symptoms WHERE x.s_id IN $symptoms | x] AS matched_list
        WHERE size(matched_list) > 0
        WITH d,
             size(matched_list) AS matched_count,
             reduce(s = 0.0, x IN matched_list | s + x.prob * coalesce($symptomWeights[x.s_id], 1.0)) AS base_score,
             reduce(s = 0.0, x IN all_symptoms | s + x.prob) AS max_possible_score,
             [x IN matched_list | {symptom: x.name, prob: x.prob, description: x.description}] AS matched_details
        ORDER BY matched_count DESC, base_score DESC
        LIMIT 15
        OPTIONAL MATCH (d)-[ra:AFFECTS_AGE]->(a:AgeGroup)
        OPTIONAL MATCH (d)-[rg:AFFECTS_SEX]->(g:Sex)
        WITH d, matched_count, base_score, max_possible_score, matched_details,
             collect(DISTINCT {age: a.name, prob: ra.probability}) AS ages,
             collect(DISTINCT {sex: g.name, prob: rg.probability}) AS sexes
        RETURN d.name AS disease, d.description AS description, d.remarks AS remarks,
               d.base_rate_boost AS baseRateBoost, d.prevalence_per_100k AS prevalencePer100k,
               matched_count, base_score, max_possible_score, matched_details, ages, sexes
      `, { symptoms: symptomsArr, symptomWeights: symptomWeights })

      let penaltyMap = {}
      if (excludedArr.length > 0) {
        const penaltyRes = await session.run(`
          MATCH (d:Disease)-[r:HAS_SYMPTOM]->(s:Symptom)
          WHERE d.name IN $diseaseNames AND s.id IN $excluded
          RETURN d.name AS disease, sum(r.probability) AS penalty_sum
        `, {
          diseaseNames: diseaseRes.records.map(r => r.get('disease')),
          excluded: excludedArr
        })
        penaltyRes.records.forEach(r => {
          penaltyMap[r.get('disease')] = r.get('penalty_sum') || 0
        })
      }

      const onset = sceResult?.temporal?.onset || null

      rankedDiseases = diseaseRes.records.map(r => {
        const name = r.get('disease')
        const baseScore = r.get('base_score')
        const maxPossibleScore = r.get('max_possible_score') || 100
        const penalty = (penaltyMap[name] || 0) * env.penaltyMultiplier
        const nodeBoost = r.get('baseRateBoost')

        let demographicMultiplier = 1.0
        if (demographics.age) {
          const matchedAgeGroup = findAgeGroup(demographics.age, r.get('ages') || [])
          if (matchedAgeGroup && matchedAgeGroup.prob !== null && matchedAgeGroup.prob !== undefined) {
            demographicMultiplier *= Math.max(0.1, matchedAgeGroup.prob)
          }
        }
        if (demographics.sex) {
          const userSex = String(demographics.sex).trim().toLowerCase()
          const diseaseSexes = (r.get('sexes') || []).filter(s => s && s.sex)
          if (diseaseSexes.length > 0) {
            const matchedSex = diseaseSexes.find(s => s.sex && s.sex.toLowerCase() === userSex)
            if (matchedSex && matchedSex.prob !== null && matchedSex.prob !== undefined) {
              demographicMultiplier *= Math.max(0.1, matchedSex.prob)
            } else {
              // Bệnh có giới hạn giới tính trong đồ thị nhưng không khớp với giới tính bệnh nhân (VD: bệnh phụ khoa ở nam)
              demographicMultiplier = 0.0
            }
          }
        }

        const temporalMultiplier = computeTemporalMultiplier(name, onset)
        const prevalenceBoost = getPrevalenceBoost(name, nodeBoost)
        const matchedCount = r.get('matched_count').toNumber()
        const coverageRatio = matchedCount / symptomsArr.length

        const { score, pct } = computeDiseaseScore({
          baseScore,
          maxPossibleScore,
          demographicMultiplier,
          temporalMultiplier,
          prevalenceBoost,
          coverageRatio,
          penalty
        })

        return {
          name,
          description: r.get('description') || '',
          remarks: r.get('remarks') || '',
          matchedCount,
          score,
          maxPossibleScore,
          pct,
          matchedDetails: r.get('matched_details').map(s => ({
            symptom: s.symptom,
            prob: s.prob,
            description: s.description || ''
          })).sort((a, b) => b.prob - a.prob).slice(0, 6),
          ages: r.get('ages').filter(a => a.age && a.prob).sort((a, b) => b.prob - a.prob).slice(0, 2),
          sexes: r.get('sexes').filter(s => s.sex && s.prob)
        }
      })
        // 1. Sort primarily by raw clinical score DESC
        .sort((a, b) => b.score - a.score)
        .slice(0, 8)

      // 2. Compute power-scaled clinical confidence percentage (power curve for high confidence & user trust)
      const powerRankings = rankedDiseases.map(d => ({ ...d, pScore: Math.pow(d.score, 1.8) }))
      const totalPowerScore = powerRankings.reduce((sum, d) => sum + d.pScore, 0)

      if (totalPowerScore > 0) {
        powerRankings.forEach((d, idx) => {
          const calculatedPct = Math.min(92, Math.max(5, Math.round((d.pScore / totalPowerScore) * 100)))
          rankedDiseases[idx].pct = calculatedPct
        })
      }

      // 3. Guarantee strict monotonic percentage rank order
      rankedDiseases.sort((a, b) => b.pct - a.pct || b.score - a.score)
    }

    let bestNextSymptoms = []
    const knownSymptoms = [...symptomsArr, ...excludedArr]

    if (rankedDiseases.length >= 2) {
      const topDiseaseNames = rankedDiseases.slice(0, 4).map(d => d.name)
      const discRes = await session.run(`
        MATCH (d:Disease)
        WHERE d.name IN $topDiseases
        OPTIONAL MATCH (d)-[r:HAS_SYMPTOM]->(s:Symptom)
        WHERE NOT s.id IN $known
        WITH s, d, coalesce(r.probability, 0.0) AS prob
        WHERE s IS NOT NULL
        WITH s.name AS symptom, s.id AS sym_id, s.description AS description,
             collect({disease: d.name, prob: prob}) AS disease_probs,
             stdev(prob) AS prob_stdev,
             avg(prob) AS prob_avg
        RETURN symptom, sym_id, description, disease_probs, size(disease_probs) AS disease_count, prob_stdev, prob_avg
        ORDER BY prob_stdev DESC, prob_avg DESC
        LIMIT 5
      `, { topDiseases: topDiseaseNames, known: knownSymptoms })

      bestNextSymptoms = discRes.records.map(rec => ({
        name: rec.get('symptom'),
        id: rec.get('sym_id'),
        description: rec.get('description') || '',
        stdev: rec.get('prob_stdev'),
        avgProb: rec.get('prob_avg'),
        byDisease: rec.get('disease_probs')
      }))
    }

    let diseaseOverview = null
    if (symptomsArr.length === 0) {
      diseaseOverview = await getDiseaseOverview(session)
    }

    return {
      allSymptomNames,
      allSymptoms,
      confirmedSymptoms: symptomsArr,
      excludedSymptoms: excludedArr,
      rankedDiseases,
      bestNextSymptoms,
      diseaseOverview,
      sce: sceResult && typeof sceResult === 'object' && !(sceResult instanceof Set) ? sceResult : null
    }

  } finally {
    await session.close()
  }
}
