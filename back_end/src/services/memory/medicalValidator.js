import { env } from '../../config/env.js'

/**
 * Partitions candidate extracted memory items into valid (high confidence confirmed)
 * and ignored (low confidence or non-confirmed) items for debug tracking.
 * @param {Array} candidateItems 
 * @returns {{ valid: Array, ignored: Array }}
 */
export function partitionMedicalCandidates(candidateItems = []) {
  const minConfidence = env.memoryMinConfidence || 0.70

  const valid = []
  const ignored = []

  for (const item of candidateItems) {
    if (!item || !item.content || typeof item.content !== 'string') continue
    const status = (item.medicalStatus || 'confirmed').toLowerCase()
    const conf = Number(item.confidence) || 0

    if (status === 'confirmed' && conf >= minConfidence) {
      valid.push({
        ...item,
        confidence: conf,
        subject: ['self', 'family', 'other'].includes(item.subject) ? item.subject : 'self',
        medicalStatus: 'confirmed',
      })
    } else if (conf >= 0.3) {
      ignored.push({
        ...item,
        confidence: conf,
        subject: ['self', 'family', 'other'].includes(item.subject) ? item.subject : 'self',
      })
    }
  }

  return { valid, ignored }
}

export function validateMedicalCandidates(candidateItems = []) {
  return partitionMedicalCandidates(candidateItems).valid
}
