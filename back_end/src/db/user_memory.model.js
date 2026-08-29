import mongoose from 'mongoose'
import { randomUUID } from 'node:crypto'

const UserMemorySchema = new mongoose.Schema(
  {
    id: {
      type: String,
      default: () => randomUUID(),
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: [
        'allergy',
        'chronic_condition',
        'medication',
        'blood_type',
        'pregnancy',
        'past_episode',
        'lifestyle',
        'display_preference',
      ],
      required: true,
      index: true,
    },
    memoryType: {
      type: String,
      enum: ['fact', 'preference', 'episode', 'observation'],
      default: 'fact',
    },
    content: {
      type: String,
      required: true,
    },
    keyVersion: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['active', 'superseded', 'contradicted', 'duplicate', 'merged', 'expired', 'deleted', 'ignored'],
      default: 'active',
      index: true,
    },
    subject: {
      type: String,
      enum: ['self', 'family', 'other'],
      default: 'self',
    },
    importance: {
      type: String,
      enum: ['critical', 'high', 'medium', 'low'],
      default: 'medium',
    },
    medicalStatus: {
      type: String,
      enum: ['confirmed', 'hypothetical', 'question', 'denied'],
      default: 'confirmed',
    },
    confidence: {
      type: Number,
      default: 0.9,
      min: 0,
      max: 1.0,
    },
    source: {
      type: String,
      enum: ['doctor_verified', 'conversation', 'manual', 'ocr', 'import'],
      default: 'conversation',
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    version: {
      type: Number,
      default: 1,
    },
    previousVersionId: {
      type: String,
      default: null,
    },
    conversationId: {
      type: String,
      default: null,
    },
    messageId: {
      type: String,
      default: null,
    },
    extractedAt: {
      type: Date,
      default: Date.now,
    },
    lastConfirmedAt: {
      type: Date,
      default: Date.now,
    },
    verificationStatus: {
      type: String,
      enum: ['verified', 'stale', 'needs_confirmation'],
      default: 'verified',
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    // Dedicated TTL Index field for ignored records (auto-purged after 30 days)
    ignoredExpiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'user_memories',
  }
)

// TTL Index on ignoredExpiresAt (deletes document when current date reaches ignoredExpiresAt)
UserMemorySchema.index({ ignoredExpiresAt: 1 }, { expireAfterSeconds: 0 })

// Compound index for memory retrieval query optimization
UserMemorySchema.index({ userId: 1, status: 1 })

export const UserMemoryModel = mongoose.model('UserMemory', UserMemorySchema)
