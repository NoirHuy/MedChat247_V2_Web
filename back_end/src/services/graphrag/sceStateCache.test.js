import { beforeEach, describe, expect, it } from 'vitest'
import { clearSCEStateCache, getSCEState, mergeSCEState, setSCEState } from './sceStateCache.js'

const headache = {
  symptomId: 'headache', status: 'positive', role: 'chief_complaint',
  attributes: { severity: 'mild', bodyLocation: null, exacerbatingFactors: [] },
}

describe('SCE state cache', () => {
  beforeEach(() => clearSCEStateCache())

  it('merges a new turn without losing prior clinical state', () => {
    const previous = {
      demographics: { age: 30, sex: 'male' },
      temporal: { durationValue: 1, durationUnit: 'days', onset: 'acute' },
      symptoms: [headache],
    }
    const incoming = {
      demographics: { age: null, sex: null },
      temporal: { durationValue: null, durationUnit: null, onset: null },
      symptoms: [{ symptomId: 'headache', status: 'positive', role: 'associated', attributes: { severity: 'moderate', bodyLocation: 'forehead', exacerbatingFactors: ['screen use'] } }],
    }

    expect(mergeSCEState(previous, incoming)).toMatchObject({
      demographics: { age: 30, sex: 'male' },
      temporal: { durationValue: 1, durationUnit: 'days', onset: 'acute' },
      symptoms: [{ symptomId: 'headache', role: 'chief_complaint', attributes: { severity: 'moderate', bodyLocation: 'forehead' } }],
    })
  })

  it('uses state only for the immediate next user turn (async)', async () => {
    await setSCEState('conversation-1', 1, { demographics: {}, temporal: {}, symptoms: [headache] })
    expect(await getSCEState('conversation-1', 2)).toMatchObject({ symptoms: [headache] })
    expect(await getSCEState('conversation-1', 3)).toBeNull()
  })
})
