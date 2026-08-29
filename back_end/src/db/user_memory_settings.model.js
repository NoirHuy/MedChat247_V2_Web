import mongoose from 'mongoose'

const UserMemorySettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    memoryEnabled: {
      type: Boolean,
      default: false,
    },
    autoRememberAllergies: {
      type: Boolean,
      default: true,
    },
    autoRememberChronic: {
      type: Boolean,
      default: true,
    },
    autoRememberMedications: {
      type: Boolean,
      default: true,
    },
    autoRememberEpisodes: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: 'user_memory_settings',
  }
)

export const UserMemorySettingsModel = mongoose.model('UserMemorySettings', UserMemorySettingsSchema)

export async function getUserMemorySettings(userId) {
  let settings = await UserMemorySettingsModel.findOne({ userId }).lean()
  if (!settings) {
    settings = await UserMemorySettingsModel.create({ userId })
    settings = settings.toObject()
  }
  return settings
}
