import { db } from "./db";

/**
 * 订阅状态机收敛：扫描过期/到期的订阅，驱动状态流转。
 *
 * 状态机（subscription.status）：
 *   trialing（试用，14天）→ currentPeriodEnd 过期 → past_due（试用结束，需付费）
 *   active（已付费）→ currentPeriodEnd 过期且未续费 → past_due
 *   past_due（逾期，宽限期默认 7 天）→ 仍续费失败 → canceled
 *   autoRenew=true 的 active 订阅：到期自动续期（发额度，续 periodEnd）
 *
 * 由 cron tick 每分钟调用（轻量，只扫到期的）。
 *
 * 试用到期处理：trialing 过期 → past_due + 租户标记 status=suspended（阻止新发送，
 *   但不删数据，充值后可恢复）。这是防"永久白嫖"的关键。
 */

const GRACE_DAYS = Number(process.env.SUBSCRIPTION_GRACE_DAYS ?? 7); // past_due 宽限期

export async function reconcileSubscriptions(): Promise<{
  expired: number;
  renewed: number;
  canceled: number;
}> {
  const stats = { expired: 0, renewed: 0, canceled: 0 };
  const now = new Date();

  // 1. trialing/active 到期处理（无 relation，用 planId/tenantId 两步查）
  const dueSubs = await db.subscription.findMany({
    where: {
      status: { in: ["trialing", "active"] },
      currentPeriodEnd: { lt: now },
    },
  });

  for (const sub of dueSubs) {
    if (sub.autoRenew && sub.status === "active" && sub.planId) {
      // 自动续费：延长周期 + 发放套餐额度
      const plan = await db.plan.findUnique({ where: { id: sub.planId }, select: { smsIncluded: true } });
      const newEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);
      await db.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { currentPeriodStart: now, currentPeriodEnd: newEnd },
        });
        if (plan && plan.smsIncluded > 0) {
          const bal = await tx.creditLedger.aggregate({ where: { tenantId: sub.tenantId }, _sum: { delta: true } });
          await tx.creditLedger.create({
            data: {
              tenantId: sub.tenantId,
              delta: plan.smsIncluded,
              balanceAfter: (bal._sum.delta ?? 0) + plan.smsIncluded,
              reason: "subscription_renewal",
              refType: "subscription",
              refId: sub.id,
            },
          });
        }
      });
      stats.renewed++;
    } else {
      // 不自动续费 或 试用到期 → past_due + 暂停租户（试用过期防白嫖）
      const tenant = await db.tenant.findUnique({ where: { id: sub.tenantId }, select: { status: true } });
      await db.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: "past_due" },
        });
        // 试用到期 → 租户暂停（阻止新发送，充值/续费后恢复）
        if (sub.status === "trialing" && tenant?.status === "active") {
          await tx.tenant.update({
            where: { id: sub.tenantId },
            data: { status: "suspended" },
          });
        }
      });
      stats.expired++;
    }
  }

  // 2. past_due 超过宽限期 → canceled
  const graceEnd = new Date(now.getTime() - GRACE_DAYS * 24 * 3600 * 1000);
  const overdue = await db.subscription.findMany({
    where: {
      status: "past_due",
      currentPeriodEnd: { lt: graceEnd },
    },
    select: { id: true, tenantId: true },
  });
  for (const sub of overdue) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: "canceled" },
    });
    // 租户关闭
    await db.tenant.update({
      where: { id: sub.tenantId },
      data: { status: "closed" },
    }).catch(() => {});
    stats.canceled++;
  }

  return stats;
}

/** 租户充值/续费后恢复：把 past_due/canceled 订阅转回 active，租户解除暂停。
 *  在支付成功回调或充值后调用。 */
export async function reactivateSubscription(tenantId: string): Promise<void> {
  const sub = await db.subscription.findFirst({
    where: { tenantId, status: { in: ["past_due", "canceled", "trialing"] } },
    orderBy: { createdAt: "desc" },
  });
  if (!sub) return;
  const newEnd = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  await db.$transaction(async (tx) => {
    await tx.subscription.update({
      where: { id: sub.id },
      data: { status: "active", currentPeriodStart: new Date(), currentPeriodEnd: newEnd, autoRenew: true },
    });
    // 租户恢复 active（解除暂停/关闭）
    await tx.tenant.updateMany({
      where: { id: tenantId, status: { in: ["suspended", "closed"] } },
      data: { status: "active" },
    });
  });
}
