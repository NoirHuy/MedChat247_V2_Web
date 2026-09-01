import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../db/user_memory.model.js', () => ({
  UserMemoryModel: { find: vi.fn() },
}))

import { UserMemoryModel } from '../../db/user_memory.model.js'
import { getChronicConditionIds } from './chronicConditions.js'

function mockFind(memories) {
  const chain = {
    sort: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    lean: vi.fn(async () => memories),
  }
  UserMemoryModel.find.mockReturnValue(chain)
  return chain
}

describe('getChronicConditionIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns [] for missing userId', async () => {
    expect(await getChronicConditionIds(null)).toEqual([])
    expect(await getChronicConditionIds(undefined)).toEqual([])
    expect(UserMemoryModel.find).not.toHaveBeenCalled()
  })

  it('queries only confirmed self-reported chronic_condition memories', async () => {
    mockFind([])
    await getChronicConditionIds('user-1')
    const filter = UserMemoryModel.find.mock.calls[0][0]
    expect(filter).toMatchObject({
      userId: 'user-1',
      category: 'chronic_condition',
      status: 'active',
      subject: 'self',
      medicalStatus: 'confirmed',
    })
  })

  it('maps Vietnamese free-text to canonical condition ids', async () => {
    mockFind([
      { content: 'Tôi bị tiểu đường type 2 từ 2020' },
      { content: 'Cao huyết áp 10 năm' },
      { content: 'Chẩn đoán Gút 6 tháng' },
      { content: 'Rối loạn lipid máu, mỡ máu cao' },
    ])
    expect(await getChronicConditionIds('user-1')).toEqual([
      'DIABETES',
      'HYPERTENSION',
      'GOUT',
      'DYSLIPIDEMIA',
    ])
  })

  it('normalizes diacritics and case when matching', async () => {
    mockFind([{ content: 'Tiểu ĐƯỜNG' }, { content: 'SUY THẬN mạn' }])
    expect(await getChronicConditionIds('user-1')).toEqual([
      'DIABETES',
      'CKD_NON_DIALYSIS',
    ])
  })

  it('prefers CKD_DIALYSIS over CKD_NON_DIALYSIS when both keywords present', async () => {
    mockFind([{ content: 'Suy thận giai đoạn cuối đang lọc máu' }])
    expect(await getChronicConditionIds('user-1')).toEqual(['CKD_DIALYSIS'])
  })

  it('deduplicates across multiple memories', async () => {
    mockFind([
      { content: 'bị tiểu đường' },
      { content: 'đường huyết cao' },
    ])
    expect(await getChronicConditionIds('user-1')).toEqual(['DIABETES'])
  })

  it('ignores unrelated memories', async () => {
    mockFind([{ content: 'Thích ăn rau củ' }, { content: 'Ngủ trước 22h' }])
    expect(await getChronicConditionIds('user-1')).toEqual([])
  })

  it('skips memories with empty content', async () => {
    mockFind([{ content: '' }, { content: '   ' }, { content: 'bị gout' }])
    expect(await getChronicConditionIds('user-1')).toEqual(['GOUT'])
  })
})
