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
      // 自动续费意向：到期后转为 past_due（而非自动发额度）。
      // 真实续费须由用户走支付渠道（subscriptions/buy），支付成功回调里才发额度。
      // 这里曾错误地"凭空发额度不扣款"——那是资金漏洞，已修复。
      // autoRenew=true 仅作为"标记用户续费意愿"，由通知系统提醒用户续费。
      const tenant = await db.tenant.findUnique({ where: { id: sub.tenantId }, select: { status: true } });
      await db.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: sub.id },
          data: { status: "past_due" },
        });
        // active 订阅到期 → 租户暂停（充值/续费后由 reactivateSubscription 恢复）
        if (tenant?.status === "active") {
          await tx.tenant.update({
            where: { id: sub.tenantId },
            data: { status: "suspended" },
          });
        }
      });
      stats.expired++;
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

/**
 * 充值后恢复租户：仅解除租户暂停（让已购额度可用），不自动续期订阅。
 * 订阅的 active 状态和周期由真实套餐购买（subscriptions/buy）驱动。
 * 注意：不改 autoRenew（由用户显式选择），不延长 currentPeriodEnd（防免费续期）。
 */
export async function reactivateSubscription(tenantId: string): Promise<void> {
  await db.tenant.updateMany({
    where: { id: tenantId, status: { in: ["suspended", "closed"] } },
    data: { status: "active" },
  });
  // 订阅若处于 past_due（因试用/周期到期），恢复为 active 但不延长周期
  // （用户充值了额度可用，但订阅周期需真实购买套餐续期）
  const sub = await db.subscription.findFirst({
    where: { tenantId, status: "past_due" },
    orderBy: { createdAt: "desc" },
  });
  if (sub) {
    await db.subscription.update({
      where: { id: sub.id },
      data: { status: "active" }, // 不改 periodEnd，到期会再次 past_due 提示续费
    });
  }
}
