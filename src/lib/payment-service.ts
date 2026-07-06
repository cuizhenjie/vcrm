import { db } from "./db";
import { getPaymentProvider } from "./payment";
import { smsUnitCostFen, smsCreditBalance } from "./billing";

/**
 * 充值服务：下单 → 支付 → 回调入账（加额度）。
 *
 * 定价：可选「按量」(单价 = SMS_UNIT_COST) 或「套餐」(Plan.smsIncluded + 固定价)。
 * 当前实现按量计费：amountFen = quantity * unitCostFen。
 */

/** 创建充值订单。返回订单 + 支付链接。 */
export async function createRechargeOrder(input: {
  tenantId: string;
  userId?: string;
  quantity: number; // 短信条数
  provider?: string; // mock | wechat | alipay
}) {
  const quantity = Math.max(1, Math.floor(input.quantity));
  if (quantity > 1_000_000) throw new Error("单次充值上限 100 万条");

  const unitCost = smsUnitCostFen();
  const amountFen = quantity * unitCost;

  const provider = getPaymentProvider(input.provider);
  if (!provider.isConfigured() && provider.name !== "mock") {
    throw new Error(`${provider.name} 支付渠道未配置`);
  }

  // 创建订单：outTradeNo 用独立 cuid 一次性生成（避免两步回填的竞态/空串阻塞）
  const { randomUUID } = await import("crypto");
  const outTradeNo = `R${Date.now()}${randomUUID().slice(0, 8)}`;
  const order = await db.paymentOrder.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId,
      amountFen,
      smsQuantity: quantity,
      provider: provider.name,
      outTradeNo,
      status: "pending",
    },
  });

  const notifyUrl = `${process.env.APP_BASE_URL || ""}/api/payment/callback/${provider.name}`;
  const res = await provider.createOrder({
    outTradeNo,
    amountFen,
    subject: `VCRM短信额度充值 ${quantity}条`,
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

  return { orderId: order.id, payUrl: res.payUrl, amountFen, quantity };
}

/**
 * 支付回调入账：校验签名 → 幂等标记 paid → 加额度。
 * 返回给渠道的同步响应内容。
 */
export async function handlePaymentCallback(
  providerName: string,
  rawBody: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const provider = getPaymentProvider(providerName);
  const result = await provider.verifyCallback(rawBody, headers);
  if (!result.ok || !result.payload) {
    return { status: 401, body: JSON.stringify({ error: result.error ?? "verify failed" }) };
  }

  const { outTradeNo, tradeNo, amountFen, status } = result.payload;
  const order = await db.paymentOrder.findUnique({ where: { outTradeNo: outTradeNo } });
  if (!order) return { status: 404, body: JSON.stringify({ error: "order not found" }) };

  // 幂等：已支付直接返回成功（渠道可能重复回调）
  if (order.status === "paid") return { status: 200, body: provider.successResponse() };
  if (status !== "paid") {
    await db.paymentOrder.update({
      where: { id: order.id },
      data: { status: "failed", failReason: "callback_failed" },
    });
    return { status: 200, body: provider.successResponse() };
  }

  // 金额强制校验（防伪造回调）：渠道必须回传金额且必须匹配
  if (amountFen == null || amountFen !== order.amountFen) {
    return { status: 400, body: JSON.stringify({ error: "amount mismatch" }) };
  }

  // 入账：用条件更新保证幂等（仅 pending→paid），防并发回调重复入账
  await db.$transaction(async (tx) => {
    // 条件更新：where 同时限定 status=pending，并发时只有一个事务能成功
    const updated = await tx.paymentOrder.updateMany({
      where: { id: order.id, status: "pending" },
      data: { status: "paid", tradeNo, paidAt: new Date() },
    });
    if (updated.count === 0) return; // 已被并发处理，跳过入账

    const balance = await smsCreditBalance(order.tenantId, tx);
    await tx.creditLedger.create({
      data: {
        tenantId: order.tenantId,
        delta: order.smsQuantity,
        balanceAfter: balance + order.smsQuantity,
        reason: "recharge",
        refType: "payment_order",
        refId: order.id,
      },
    });
  });

  // 充值成功后：恢复暂停的租户（试用到期被暂停的客户，充值后自动恢复）
  try {
    const { reactivateSubscription } = await import("./subscription-scheduler");
    await reactivateSubscription(order.tenantId);
  } catch (e) {
    console.error("[payment] reactivate subscription failed", e);
  }

  return { status: 200, body: provider.successResponse() };
}
