import cron from 'node-cron'
import { UserModel } from '../db/user.model.js'

// Check expired subscriptions and update status
export async function checkExpiredSubscriptions() {
  const now = new Date()
  const expiredUsers = await UserModel.find({
    planId: 'pro',
    subscriptionExpiresAt: { $lte: now }
  })

  for (const user of expiredUsers) {
    console.log(`[Billing Scheduler] Subscription expired for User ID: ${user.id}`)
    await UserModel.updateOne(
      { id: user.id },
      {
        $set: {
          subscriptionStatus: 'expired',
          planId: 'free',
          autoRenew: false,
        }
      }
    )
  }
}

export function startBillingScheduler() {
  // Check expired subscriptions daily at 01:00 AM
  cron.schedule('0 1 * * *', async () => {
    console.log('[Billing Scheduler] Checking for expired subscriptions...')
    try {
      await checkExpiredSubscriptions()
    } catch (err) {
      console.error('[Billing Scheduler][Error] Expiry check failed:', err.message)
    }
  })
  console.log('[Billing Scheduler] Subscription expiration checker activated (Runs at 01:00 AM daily).')
}
