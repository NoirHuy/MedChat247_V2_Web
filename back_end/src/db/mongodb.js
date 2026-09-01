import mongoose from 'mongoose'
import { env } from '../config/env.js'

export async function connectDatabase() {
  try {
    await mongoose.connect(env.mongodbUri)
    console.log('MongoDB connected successfully.')
  } catch (error) {
    console.error('MongoDB connection error:', error)
    process.exit(1)
  }
}

export async function closeDatabase() {
  if (mongoose.connection.readyState === 0) return
  await mongoose.connection.close()
  console.log('MongoDB connection closed.')
}
