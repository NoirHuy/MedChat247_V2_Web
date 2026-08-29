import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'

const MemoryAuditSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => randomUUID(),
      unique: true,
      index: true,
    },
    memoryId: {
      type: String,
      required: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    action: {
      type: String,
      enum: ['create', 'merge', 'edit', 'delete', 'lock', 'unlock', 'expire', 'contradict', 'supersede'],
      required: true,
    },
    performedBy: {
      type: String,
      enum: ['ai', 'user', 'doctor', 'system'],
      default: 'ai',
    },
    previousContent: {
      type: String,
      default: null,
    },
    newContent: {
      type: String,
      default: null,
    },
    meta: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
)

export const MemoryAuditModel = mongoose.model('MemoryAudit', MemoryAuditSchema)

export async function logMemoryAudit({ memoryId, userId, action, performedBy = 'ai', previousContent = null, newContent = null, meta = {} }) {
  try {
    await MemoryAuditModel.create({
      memoryId,
      userId,
      action,
      performedBy,
      previousContent,
      newContent,
      meta,
    })
  } catch (err) {
    console.error('[MemoryAudit] Failed to record audit log:', err)
  }
}
