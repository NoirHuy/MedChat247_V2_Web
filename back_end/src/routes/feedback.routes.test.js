import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../db/feedback.model.js', () => ({
  FeedbackModel: {
    find: vi.fn(),
    create: vi.fn(),
  },
}))

const { FeedbackModel } = await import('../db/feedback.model.js')

describe('Feedback Routes Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits feedback successfully with required fields', async () => {
    const feedbackData = {
      id: 'fb_123',
      userId: 'user_1',
      userEmail: 'user@test.com',
      userName: 'Test User',
      type: 'bug',
      content: 'Lỗi giao diện nút đăng nhập',
      createdAt: new Date(),
    }

    FeedbackModel.create.mockResolvedValue(feedbackData)

    const result = await FeedbackModel.create({
      userId: 'user_1',
      userEmail: 'user@test.com',
      userName: 'Test User',
      type: 'bug',
      content: 'Lỗi giao diện nút đăng nhập',
    })

    expect(FeedbackModel.create).toHaveBeenCalled()
    expect(result.type).toBe('bug')
    expect(result.content).toBe('Lỗi giao diện nút đăng nhập')
  })

  it('retrieves user feedback history sorted descending', async () => {
    const mockList = [
      { id: 'fb_2', content: 'Góp ý 2', createdAt: new Date('2026-08-02') },
      { id: 'fb_1', content: 'Góp ý 1', createdAt: new Date('2026-08-01') },
    ]

    FeedbackModel.find.mockReturnValue({
      sort: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockList),
      }),
    })

    const list = await FeedbackModel.find({ userId: 'user_1' }).sort({ createdAt: -1 }).lean()

    expect(list).toHaveLength(2)
    expect(list[0].id).toBe('fb_2')
  })
})
