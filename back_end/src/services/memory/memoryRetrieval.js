import { UserMemoryModel } from '../../db/user_memory.model.js'
import { getUserMemorySettings } from '../../db/user_memory_settings.model.js'
import { decryptText } from '../../utils/memoryCrypto.js'
import { rankMemoriesForPrompt } from './memoryRanking.js'

/**
 * Retrieves active user memories, decrypts them, runs ranking, and formats system prompt block.
 * @param {string} userId 
 * @param {string} currentQuery 
 * @returns {Promise<{ promptBlock: string, memoriesUsed: Array }>}
 */
export async function getActiveMemoryContext(userId, currentQuery = '') {
  if (!userId) return { promptBlock: '', memoriesUsed: [] }

  try {
    const settings = await getUserMemorySettings(userId)
    if (!settings.memoryEnabled) {
      return { promptBlock: '', memoriesUsed: [] }
    }

    // Fetch active memories (exclude soft deleted, expired, ignored)
    const rawMemories = await UserMemoryModel.find({
      userId,
      status: 'active',
    }).lean()

    if (!rawMemories || rawMemories.length === 0) {
      return { promptBlock: '', memoriesUsed: [] }
    }

    // Decrypt content for each memory item, dropping records whose ciphertext
    // can no longer be authenticated (never inject raw ciphertext into prompts).
    const decryptedMemories = rawMemories
      .map(m => ({ ...m, content: decryptText(m.content) }))
      .filter(m => m.content !== null)

    // Filter memories based on granular user toggles
    const filteredMemories = decryptedMemories.filter(m => {
      if (m.category === 'allergy' && !settings.autoRememberAllergies) return false
      if (m.category === 'chronic_condition' && !settings.autoRememberChronic) return false
      if (m.category === 'medication' && !settings.autoRememberMedications) return false
      if (m.category === 'past_episode' && !settings.autoRememberEpisodes) return false
      return true
    })

    // Rank memories and select within token budget
    const selectedMemories = rankMemoriesForPrompt(filteredMemories, currentQuery)

    if (selectedMemories.length === 0) {
      return { promptBlock: '', memoriesUsed: [] }
    }

    // Format memories into System Prompt block
    const formattedList = selectedMemories
      .map(m => `- [${(m.category || '').toUpperCase()} | ${m.subject === 'family' ? 'Tiền sử gia đình' : 'Bản thân'}] ${m.content}`)
      .join('\n')

    const promptBlock = `
[HỒ SƠ TRÍ NHỚ CÁ NHÂN NGƯỜI DÙNG]
Hệ thống lưu giữ các thông tin tiền sử y tế đã được xác thực của bệnh nhân như sau:
${formattedList}

QUY TẮC AN TOÀN NGHUYÊN TẮC Y TẾ BẮT BUỘC:
- Hãy sử dụng thông tin trên để cá nhân hóa kết quả sàng lọc chuẩn xác hơn.
- NẾU phát hiện thuốc/phác đồ sắp tư vấn vi phạm DỊ ỨNG hoặc BỆNH NỀN trong hồ sơ, BẮT BUỘC phải đưa ra CẢNH BÁO NGUY HIỂM XUNG ĐỘT Y TẾ khuyên bệnh nhân KHÔNG ĐƯỢC DÙNG.
`

    const memoriesUsed = selectedMemories.map(m => ({
      id: m.id,
      category: m.category,
      subject: m.subject,
      contentSnippet: m.content,
    }))

    return { promptBlock, memoriesUsed }
  } catch (err) {
    console.error('[MemoryRetrieval] Error fetching memory context:', err)
    return { promptBlock: '', memoriesUsed: [] }
  }
}
