import type { PrismaClient } from "@prisma/client";
import { db } from "./db";
import { getPaymentProvider } from "./payment";
import { smsCreditBalance } from "./billing";

type Tx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * 套餐订阅服务：购买/升级套餐 → 支付 → 改 subscription + 发额度 + 出 Invoice。
 *
 * 与按量充值的区别：
 *   - 充值：加额度，不动订阅
 *   - 套餐：改 subscription.planId/status/currentPeriodEnd + 发 smsIncluded 额度 + 生成 Invoice
 *
 * 购买流程：createSubscriptionOrder → 支付 → handleSubscriptionCallback（回调里改订阅+发额度+出账）
 */

/** 创建套餐购买订单。返回订单 + 支付链接。 */
export async function createSubscriptionOrder(input: {
  tenantId: string;
  userId?: string;
  planCode: string;
  provider?: string;
}) {
  const plan = await db.plan.findUnique({ where: { code: input.planCode } });
  if (!plan) throw new Error("套餐不存在");
  if (plan.monthlyFeeFen <= 0) throw new Error("该套餐为免费套餐，无需购买");

  const provider = getPaymentProvider(input.provider);
  if (!provider.isConfigured() && provider.name !== "mock") {
    throw new Error(`${provider.name} 支付渠道未配置`);
  }

  const { randomUUID } = await import("crypto");
  const outTradeNo = `S${Date.now()}${randomUUID().slice(0, 8)}`;
  const order = await db.paymentOrder.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      amountFen: plan.monthlyFeeFen,
      smsQuantity: plan.smsIncluded,
      planCode: plan.code,
      orderType: "subscription",
      provider: provider.name,
      outTradeNo,
      status: "pending",
    },
  });

  const notifyUrl = `${process.env.APP_BASE_URL || ""}/api/payment/callback/${provider.name}`;
  const res = await provider.createOrder({
    outTradeNo,
    amountFen: plan.monthlyFeeFen,
    subject: `VCRM套餐 ${plan.name}（月付）`,
    notifyUrl,
  });

  if (!res.ok) {
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: "failed", failReason: res.errorCode ?? "create_order_failed" },
    });
    throw new Error(`下单失败：${res.errorCode ?? "unknown"}`);
  }

  await db.paymentOrder.update({
    where: { id: order.id },
    data: { payUrl: res.payUrl, rawResponse: JSON.stringify(res.raw ?? {}) },
  });

  return { orderId: order.id, payUrl: res.payUrl, amountFen: plan.monthlyFeeFen, planName: plan.name };
}

/**
 * 套餐支付成功后处理：改订阅状态 + 发套餐额度 + 生成 Invoice。
 * 由 handlePaymentCallback 在 orderType=subscription 时调用。
 * 幂等：PaymentOrder 的 pending→paid 条件更新保证只执行一次。
 */
export async function fulfillSubscriptionOrder(orderId: string, tx: Tx): Promise<void> {
  const order = await tx.paymentOrder.findUnique({ where: { id: orderId } });
  if (!order || order.orderType !== "subscription" || !order.planCode) return;

  const plan = await tx.plan.findUnique({ where: { code: order.planCode } });
  if (!plan) return;

  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 3600 * 1000);

  // 升级/续费订阅：找到现有订阅更新，没有则创建
  const existing = await tx.subscription.findFirst({
    where: { tenantId: order.tenantId },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    await tx.subscription.update({
      where: { id: existing.id },
      data: {
        planId: plan.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        autoRenew: true,
      },
    });
  } else {
    await tx.subscription.create({
      data: {
        tenantId: order.tenantId,
        planId: plan.id,
        status: "active",
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        autoRenew: true,
      },
    });
  }

  // 发放套餐包含的额度
  if (plan.smsIncluded > 0) {
    const bal = await smsCreditBalance(order.tenantId, tx);
    await tx.creditLedger.create({
      data: {
        tenantId: order.tenantId,
        delta: plan.smsIncluded,
        balanceAfter: bal + plan.smsIncluded,
        reason: "subscription_purchase",
        refType: "payment_order",
        refId: order.id,
      },
    });
  }

  // 生成 Invoice（账单）
  await tx.invoice.create({
    data: {
      tenantId: order.tenantId,
      periodStart: now,
      periodEnd,
      amountFen: order.amountFen,
      status: "paid",
      issuedAt: now,
      paidAt: now,
    },
  });
}
