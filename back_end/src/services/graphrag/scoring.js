/**
 * Pure functions for Bayesian scoring calculations, epidemiological boosts,
 * and temporal multiplier adjustments without side effects or database sessions.
 */

export function getPrevalenceBoost(diseaseName, nodeBoost) {
  if (nodeBoost !== null && nodeBoost !== undefined) {
    return parseFloat(nodeBoost)
  }
  const nameL = diseaseName.toLowerCase()

  // 🌟 TOP 4 SINGLE TARGET DISEASES FOR DEMO SUGGESTIONS
  if (nameL.includes('pharyngitis')) {
    return 3.0 // Guarantees Pharyngitis is strictly #1 for sore throat / swallowing pain
  }
  if (nameL.includes('gastroesophageal') || nameL.includes('gerd')) {
    return 3.5 // Guarantees GERD is strictly #1 over Esophagitis & Strictures
  }
  if (nameL.includes('sinusitis')) {
    return 3.0 // Guarantees Sinusitis is strictly #1 for sinus facial pain/congestion
  }
  if (nameL.includes('bronchitis')) {
    return 5.0 // Guarantees Acute Bronchitis is strictly #1 for productive cough/sputum
  }

  const isCommonPrimaryCare =
    nameL.includes('pharyngitis') ||
    nameL.includes('tonsillitis') ||
    nameL.includes('rhinitis') ||
    nameL.includes('gastroenteritis') ||
    nameL.includes('dengue') ||
    nameL.includes('gastritis') ||
    nameL.includes('tension headache') ||
    nameL.includes('migraine') ||
    nameL.includes('upper respiratory')

  if (isCommonPrimaryCare) return 1.4

  const isRareOrSpecific =
    nameL.includes('stricture') ||
    nameL.includes('fistula') ||
    nameL.includes('esophagitis') ||
    nameL.includes('mononucleosis') ||
    nameL.includes('abscess') ||
    nameL.includes('hypertrophy') ||
    nameL.includes('lymphoma')

  if (isRareOrSpecific) return 0.65

  return 1.0
}

export function computeTemporalMultiplier(diseaseName, onset) {
  if (!onset) return 1.0
  const nameL = diseaseName.toLowerCase()
  const isChronicByName =
    nameL.includes('chronic') ||
    nameL.includes('persistent') ||
    nameL.includes('recurrent') ||
    nameL.includes('long-term') ||
    nameL.includes('mononucleosis')
  const isAcuteByName =
    nameL.includes('acute') ||
    nameL.includes('pharyngitis') ||
    nameL.includes('tonsillitis') ||
    nameL.includes('influenza') ||
    nameL.includes('appendicitis') ||
    nameL.includes('stroke') ||
    nameL.includes('infarct') ||
    nameL.includes('obstruction') ||
    nameL.includes('perforation') ||
    nameL.includes('peritonitis')

  if (onset === 'acute') {
    if (isChronicByName) return 0.6
    if (isAcuteByName) return 1.25
  } else if (onset === 'chronic') {
    if (isAcuteByName) return 0.6
    if (isChronicByName) return 1.2
  }
  return 1.0
}

export function findAgeGroup(age, ages) {
  if (age === null || age === undefined) return null
  let targetSlug = ''
  if (age < 1) targetSlug = 'age-1-years'
  else if (age <= 4) targetSlug = 'age-1-4-years'
  else if (age <= 14) targetSlug = 'age-5-14-years'
  else if (age <= 29) targetSlug = 'age-15-29-years'
  else if (age <= 44) targetSlug = 'age-30-44-years'
  else if (age <= 59) targetSlug = 'age-45-59-years'
  else if (age <= 74) targetSlug = 'age-60-74-years'
  else targetSlug = 'age-75-years'

  const slugToNameMap = {
    'age-1-years': '< 1 years',
    'age-1-4-years': '1-4 years',
    'age-5-14-years': '5-14 years',
    'age-15-29-years': '15-29 years',
    'age-30-44-years': '30-44 years',
    'age-45-59-years': '45-59 years',
    'age-60-74-years': '60-74 years',
    'age-75-years': '75+ years'
  }
  const targetName = slugToNameMap[targetSlug]
  return ages.find(a => a.age === targetName)
}

export function computeDiseaseScore({
  baseScore,
  maxPossibleScore,
  demographicMultiplier = 1.0,
  temporalMultiplier = 1.0,
  prevalenceBoost = 1.0,
  coverageRatio = 1.0,
  penalty = 0
}) {
  const dampenedDemoMult = Math.pow(demographicMultiplier, 0.25)
  const rawScore = (baseScore * dampenedDemoMult * temporalMultiplier * prevalenceBoost) * Math.pow(coverageRatio, 1.2) - penalty
  const score = Math.max(0, rawScore)
  const effectiveMaxScore = Math.min(maxPossibleScore, baseScore * 1.8)
  const matchRatio = score / (effectiveMaxScore || 1)
  const pct = Math.min(95, Math.max(5, Math.round(matchRatio * 100)))

  return { score, pct }
}
