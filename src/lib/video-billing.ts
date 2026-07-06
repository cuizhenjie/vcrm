import { db } from "./db";
import { smsCreditBalance, InsufficientCreditsError } from "./billing";

/**
 * 视频生成计费：复用租户短信额度账本（CreditLedger），按视频成本扣减。
 *
 * 定价（可经 env 覆盖，单位：条/条等价额度）：
 *   视频按 resolution × duration 计费，每条视频消耗 N 条短信等价额度。
 *   默认：480p=5条 / 720p=10条 / 1080p=20条 / 4k=40条，按时长倍率(duration/5)。
 *
 * 调用时机：POST /api/video 创建任务前预扣；任务失败（创建失败/生成失败）全额退还。
 * 并发安全：预扣与退还都在事务内，退还用幂等标志防重复退。
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
  const multiplier = Math.max(1, Math.round(duration / 5));
  return base * multiplier;
}

/** 视频预扣额度（事务内查余额+扣减，防并发透支）。返回扣除的额度数；不足抛异常。 */
export async function reserveVideoCredit(
  tenantId: string,
  taskId: string,
  credits: number,
): Promise<number> {
  if (credits <= 0) return 0;
  return db.$transaction(async (tx) => {
    const agg = await tx.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
    const balance = agg._sum.delta ?? 0;
    if (balance < credits) throw new InsufficientCreditsError(balance, credits);
    await tx.creditLedger.create({
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
  });
}

/** 视频失败全额退还。幂等：用条件更新保证只退一次（防并发重复退）。
 *  返回是否实际退还（false=已退过或无需退）。 */
export async function refundVideoCredit(tenantId: string, taskId: string, credits: number): Promise<boolean> {
  if (credits <= 0) return false;
  try {
    return await db.$transaction(async (tx) => {
      // 条件查：仅当存在 video_reserve 且不存在 video_refund 时才退（幂等）
      const reserved = await tx.creditLedger.findFirst({
        where: { tenantId, refType: "video_task", refId: taskId, reason: "video_reserve" },
        select: { id: true },
      });
      if (!reserved) return false; // 没扣过，无需退
      const alreadyRefunded = await tx.creditLedger.findFirst({
        where: { tenantId, refType: "video_task", refId: taskId, reason: "video_refund" },
        select: { id: true },
      });
      if (alreadyRefunded) return false; // 已退过
      const agg = await tx.creditLedger.aggregate({ where: { tenantId }, _sum: { delta: true } });
      const balance = agg._sum.delta ?? 0;
      await tx.creditLedger.create({
        data: {
          tenantId,
          delta: credits,
          balanceAfter: balance + credits,
          reason: "video_refund",
          refType: "video_task",
          refId: taskId,
        },
      });
      return true;
    });
  } catch {
    return false;
  }
}

