import { db } from "./db";
import { smsCreditBalance, InsufficientCreditsError } from "./billing";

/**
 * 视频生成计费：复用租户短信额度账本（CreditLedger），按视频成本扣减。
 *
 * 定价（可经 env 覆盖，单位：条/条等价额度）：
 *   视频按 resolution × duration 计费，每条视频消耗 N 条短信等价额度。
 *   默认：480p=5条 / 720p=10条 / 1080p=20条 / 4k=40条，按时长倍率(duration/5)。
 *   例如 1080p 10秒 = 20 × (10/5) = 40 条额度。
 *
 * 调用时机：POST /api/video 创建任务前预扣；任务失败全额退还。
 */

const PRICE_TABLE: Record<string, number> = {
  "480p": 5,
  "720p": 10,
  "1080p": 20,
  "4k": 40,
};

/** 根据参数计算视频消耗的额度（条）。 */
export function videoCostCredits(params?: { resolution?: string; duration?: number }): number {
  const resolution = params?.resolution ?? "1080p";
  const duration = params?.duration ?? 5;
  const base = PRICE_TABLE[resolution] ?? 20;
  // 时长倍率：每 5 秒一倍（向下取整至少 1）
  const multiplier = Math.max(1, Math.round(duration / 5));
  return base * multiplier;
}

/** 视频预扣额度。返回扣除的额度数；不足抛 InsufficientCreditsError。 */
export async function reserveVideoCredit(
  tenantId: string,
  taskId: string,
  credits: number,
): Promise<number> {
  if (credits <= 0) return 0;
  const balance = await assertCredits(tenantId, credits);
  await db.creditLedger.create({
    data: {
      tenantId,
      delta: -credits,
      balanceAfter: balance - credits,
      reason: "video_reserve",
      refType: "video_task",
      refId: taskId,
    },
  });
  return credits;
}

/** 视频失败全额退还。幂等：已退过的不再退（按 reason 区分）。 */
export async function refundVideoCredit(tenantId: string, taskId: string, credits: number): Promise<void> {
  if (credits <= 0) return;
  // 幂等：检查是否已退过
  const refunded = await db.creditLedger.findFirst({
    where: { tenantId, refType: "video_task", refId: taskId, reason: "video_refund" },
    select: { id: true },
  });
  if (refunded) return;
  const balance = await smsCreditBalance(tenantId);
  await db.creditLedger.create({
    data: {
      tenantId,
      delta: credits,
      balanceAfter: balance + credits,
      reason: "video_refund",
      refType: "video_task",
      refId: taskId,
    },
  });
}

async function assertCredits(tenantId: string, required: number): Promise<number> {
  const balance = await smsCreditBalance(tenantId);
  if (balance < required) throw new InsufficientCreditsError(balance, required);
  return balance;
}
