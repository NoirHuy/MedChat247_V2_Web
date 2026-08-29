import { SubscriptionModel } from '../db/subscription.model.js'
import { UserModel } from '../db/user.model.js'

const PRO_PLAN_DAYS = 30
const PRO_PLAN_MS = PRO_PLAN_DAYS * 24 * 60 * 60 * 1000

/**
 * Đồng bộ trạng thái Pro của user dựa trên tất cả subscriptions còn hiệu lực.
 * - Nếu có ít nhất 1 sub active → plan = 'pro'
 * - Nếu không có → plan = 'free'
 */
export async function syncUserProStatus(userId) {
  const now = new Date()
  // Thêm buffer 5 giây để chống lệch miligiây giữa clock thời gian tạo và query
  const queryNow = new Date(now.getTime() - 5000)

  const activeSubs = await SubscriptionModel.find({
    userId,
    status: 'active',
    expiresAt: { $gt: queryNow },
    canceledAt: null,
  })

  if (activeSubs.length === 0) {
    await UserModel.findOneAndUpdate(
      { id: userId },
      {
        $set: {
          planId: 'free',
          subscriptionStatus: 'none',
          subscriptionExpiresAt: null,
          autoRenew: false,
        },
      },
    )
    return { action: 'downgraded', activeCount: 0 }
  }

  const latestExpiry = activeSubs.reduce(
    (max, sub) => (sub.expiresAt > max ? sub.expiresAt : max),
    activeSubs[0].expiresAt,
  )

  await UserModel.findOneAndUpdate(
    { id: userId },
    {
      $set: {
        planId: 'pro',
        subscriptionStatus: 'active',
        subscriptionExpiresAt: latestExpiry,
        autoRenew: activeSubs.some((s) => s.autoRenew),
      },
    },
  )

  return {
    action: 'upgraded',
    activeCount: activeSubs.length,
    expiresAt: latestExpiry,
  }
}

/**
 * Tạo hoặc cập nhật subscription, sau đó đồng bộ plan của user.
 */
export async function upsertSubscriptionAndSync({
  userId,
  platform,
  externalId,
  productId,
  startedAt = new Date(),
  expiresAt = new Date(Date.now() + PRO_PLAN_MS),
  autoRenew = true,
  metadata = {},
}) {
  const sub = await SubscriptionModel.findOneAndUpdate(
    { userId, platform, externalId },
    {
      $set: {
        productId,
        status: 'active',
        startedAt,
        expiresAt,
        autoRenew,
        canceledAt: null,
        metadata,
      },
      $setOnInsert: { userId, platform, externalId },
    },
    { upsert: true, new: true },
  )

  await syncUserProStatus(userId)
  return sub
}

/**
 * Hủy subscription (khi user refund / cancel) rồi đồng bộ plan.
 */
export async function cancelSubscriptionAndSync({ userId, platform, externalId }) {
  const sub = await SubscriptionModel.findOneAndUpdate(
    { userId, platform, externalId },
    {
      $set: {
        status: 'canceled',
        canceledAt: new Date(),
      },
    },
    { new: true },
  )

  if (sub) {
    await syncUserProStatus(userId)
  }

  return sub
}

/**
 * Lấy tất cả subscriptions hiện tại của user.
 */
export async function getUserActiveSubscriptions(userId) {
  const now = new Date()
  return SubscriptionModel.find({
    userId,
    status: 'active',
    expiresAt: { $gt: now },
    canceledAt: null,
  }).lean()
}
