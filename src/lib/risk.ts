// 敏感地域示例（按业务/合规调整）
const SENSITIVE_PROVINCES = new Set<string>(["新疆", "西藏"]);

export type RiskVerdict = { pass: boolean; reason?: string };

/** 发送前风控：黑名单 + 敏感地域。空号在号码检测阶段已剔除。 */
export function checkRisk(c: { isBlacklist: boolean; province?: string | null }): RiskVerdict {
  if (c.isBlacklist) return { pass: false, reason: "黑名单" };
  if (c.province && SENSITIVE_PROVINCES.has(c.province)) return { pass: false, reason: "敏感地域" };
  return { pass: true };
}

// recentlySent 已迁移到 ./frequency.ts（Redis 抽象层）
export { recentlySent, markSent } from "./frequency";

