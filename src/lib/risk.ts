import { db } from "./db";
// 敏感地域示例（按业务/合规调整）
const SENSITIVE_PROVINCES = new Set<string>(["新疆", "西藏"]);

export type RiskVerdict = { pass: boolean; reason?: string };

/** 发送前风控：黑名单 + 敏感地域。空号在号码检测阶段已剔除。 */
export function checkRisk(c: { isBlacklist: boolean; province?: string | null }): RiskVerdict {
  if (c.isBlacklist) return { pass: false, reason: "黑名单" };
  if (c.province && SENSITIVE_PROVINCES.has(c.province)) return { pass: false, reason: "敏感地域" };
  return { pass: true };
}

/** 简单频控：同号 N 天内是否已发送过（MVP 用 DB 计数；生产建议 Redis） */
export async function recentlySent(mobile: string, days = 1, tenantId?: string): Promise<boolean> {
  const since = new Date(Date.now() - days * 86400_000);
  const n = await db.recipient.count({
    where: { mobile, sendStatus: "sent", createdAt: { gte: since }, ...(tenantId ? { tenantId } : {}) },
  });
  return n > 0;
}
