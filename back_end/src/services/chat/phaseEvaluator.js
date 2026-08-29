/**
 * Single Source of Truth for Phase Determination in MedChat247.
 */
export function evaluatePhase({ checklistStatus, sceResult, turnCount, isSuggestionDemo = false }) {
  const hasPositiveSymptoms = sceResult?.symptoms?.some(s => s.status === 'positive') ?? false
  const isChecklistComplete = checklistStatus.hasAgeSex && checklistStatus.hasDuration && checklistStatus.hasSeverity

  // Single Source of Truth for Phase Determination:
  // - ONLY if isSuggestionDemo is explicitly true (user clicked Suggestion 1 chip) -> Phase 2 (Instant Report).
  // - For manually typed inputs or Suggestion 2 -> Turn 1 stays in Phase 1 to ask clarifying questions.
  // - Turn 2+: If checklist (age/sex, duration, severity) is complete and positive symptoms exist -> Phase 2 (Report).
  // - Turn 4+: Safety ceiling cap -> Phase 2 (Report).
  const isPhase2 = !!isSuggestionDemo || (turnCount >= 2 && isChecklistComplete && hasPositiveSymptoms) || (turnCount >= 4)

  return {
    phase: isPhase2 ? 2 : 1,
    isChecklistComplete,
    hasPositiveSymptoms,
    turnCount
  }
}
