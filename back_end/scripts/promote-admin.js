#!/usr/bin/env node
// Promote (or demote with --revoke) a user's admin role directly in MongoDB.
//
// Usage:
//   node scripts/promote-admin.js admin@your-domain.example.com
//   node scripts/promote-admin.js --revoke admin@your-domain.example.com
//
// Admin privileges are granted exclusively through the `role` field — there is
// deliberately no email-based auto-grant in requireAdmin.

import mongoose from 'mongoose'

const args = process.argv.slice(2)
const revoke = args.includes('--revoke')
const email = args.find((a) => !a.startsWith('--'))?.toLowerCase()

if (!email) {
  console.error('Usage: node scripts/promote-admin.js [--revoke] <user-email>')
  process.exit(1)
}

async function main() {
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.error('[promote-admin] MONGODB_URI is required (load back_end/.env first).')
    process.exit(1)
  }

  await mongoose.connect(uri)
  const users = mongoose.connection.collection('users')
  const result = await users.updateOne({ email }, { $set: { role: revoke ? 'user' : 'admin' } })

  if (result.matchedCount === 0) {
    console.error(`[promote-admin] No user found with email: ${email}`)
    process.exitCode = 1
  } else {
    console.log(`[promote-admin] ${email} role set to "${revoke ? 'user' : 'admin'}".`)
  }
  await mongoose.disconnect()
}

main().catch((err) => {
  console.error('[promote-admin] Failed:', err.message)
  process.exit(1)
})
