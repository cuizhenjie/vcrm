import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";
import { currentTenantId } from "./tenant";

type Tx = Prisma.TransactionClient | PrismaClient;

export class InsufficientCreditsError extends Error {
  constructor(public readonly balance: number, public readonly required: number) {
    super(`短信额度不足：当前 ${balance}，需要 ${required}`);
    this.name = "InsufficientCreditsError";
  }
}

export async function smsCreditBalance(tenantId = currentTenantId(), client: Tx = db): Promise<number> {
  const agg = await client.creditLedger.aggregate({
    where: { tenantId },
    _sum: { delta: true },
  });
  return agg._sum.delta ?? 0;
}

export async function assertSmsCredits(tenantId: string, required: number, client: Tx = db) {
  const balance = await smsCreditBalance(tenantId, client);
  if (balance < required) throw new InsufficientCreditsError(balance, required);
  return balance;
}

export function smsUnitCostFen(raw: string | undefined = process.env.SMS_UNIT_COST): number {
  const text = raw?.trim();
  if (!text) return 5; // 空串/未配置 → 默认 5 分（与 roi.smsUnitCost 一致）
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return 5;
  return Math.round(n * 100);
}

export async function reserveSmsCredit(
  client: Tx,
  input: { tenantId: string; recipientId: string; type: string; quantity?: number },
) {
  const quantity = input.quantity ?? 1;
  const existing = await client.usageRecord.findFirst({
    where: {
      tenantId: input.tenantId,
      type: input.type,
      refType: "recipient",
      refId: input.recipientId,
    },
  });
  if (existing) return { alreadyReserved: true, usageRecord: existing };

  const balance = await assertSmsCredits(input.tenantId, quantity, client);
  const unitCostFen = smsUnitCostFen();
  const usageRecord = await client.usageRecord.create({
    data: {
      tenantId: input.tenantId,
      type: input.type,
      quantity,
      unitCostFen,
      totalCostFen: unitCostFen * quantity,
      status: "billable",
      refType: "recipient",
      refId: input.recipientId,
    },
  });
  await client.creditLedger.create({
    data: {
      tenantId: input.tenantId,
      delta: -quantity,
      balanceAfter: balance - quantity,
      reason: "send_reserve",
      refType: "recipient",
      refId: input.recipientId,
    },
  });
  return { alreadyReserved: false, usageRecord };
}

export async function refundSmsCredit(
  client: Tx,
  input: { tenantId: string; recipientId: string; reason: string },
) {
  // 注意：不限定 type。预扣按活动类型记录(sms/mms/flash)，退款需匹配任意类型，
  // 否则视频短信/闪信活动的额度永远退不回来。取最近一条未退款的记录。
  const usage = await client.usageRecord.findFirst({
    where: {
      tenantId: input.tenantId,
      refType: "recipient",
      refId: input.recipientId,
      status: { not: "refunded" },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!usage) return false;
  // 条件更新保证幂等：仅未退款→已退款，防并发回调重复退款
  const updated = await client.usageRecord.updateMany({
    where: { id: usage.id, status: { not: "refunded" } },
    data: { status: "refunded" },
  });
  if (updated.count === 0) return false; // 并发已被处理
  const balance = await smsCreditBalance(input.tenantId, client);
  await client.creditLedger.create({
    data: {
      tenantId: input.tenantId,
      delta: usage.quantity,
      balanceAfter: balance + usage.quantity,
      reason: input.reason,
      refType: "recipient",
      refId: input.recipientId,
    },
  });
  return true;
}

