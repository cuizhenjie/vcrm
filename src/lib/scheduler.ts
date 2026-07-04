import { db } from "./db";
import { processCampaign } from "./tasks";

/** 是否处于避扰时段（跨午夜自动处理）。默认 22:00–08:00 不发。
 *  时区：默认按 Asia/Shanghai（北京时间），可经 TZ env 覆盖。
 *  修复 UTC 容器错位问题：用 Intl 显式取目标时区的小时数，
 *  而非 new Date().getHours()（后者取服务器本地时区，Vercel/容器多为 UTC，会错位 8 小时）。
 */
export function inQuietHours(d = new Date()): boolean {
  const start = Number(process.env.QUIET_START ?? 22);
  const end = Number(process.env.QUIET_END ?? 8);
  const tz = process.env.QUIET_TZ ?? "Asia/Shanghai";
  // 起始/结束小时非法值会导致避扰时段被静默禁用，回落默认值并告警
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start > 23 || end < 0 || end > 23) {
    console.warn(`[quiet-hours] QUIET_START/END 配置非法(start=${process.env.QUIET_START}, end=${process.env.QUIET_END})，回落 22-8`);
    return getHourInTz(d, tz) >= 22 || getHourInTz(d, tz) < 8;
  }
  const h = getHourInTz(d, tz);
  return start < end ? h >= start && h < end : h >= start || h < end;
}

/** 用 Intl 取指定时区的小时数（0-23），避免依赖服务器本地时区。 */
function getHourInTz(d: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false });
    const parts = fmt.formatToParts(d);
    const hour = parts.find((p) => p.type === "hour")?.value;
    const n = Number(hour);
    return Number.isFinite(n) ? (n === 24 ? 0 : n) : d.getHours();
  } catch {
    // 时区非法：告警并回落服务器本地时区（Vercel 多为 UTC，运维需关注）
    console.warn(`[quiet-hours] 时区 ${tz} 非法，回落服务器本地时区`);
    return d.getHours();
  }
}

/** 扫描到期的定时任务并发送；命中避扰时段则顺延到下次 tick。 */
export async function runDueCampaigns() {
  const now = new Date();
  const due = await db.campaign.findMany({
    where: { status: "scheduled", scheduledAt: { lte: now } },
  });
  const result: { processed: string[]; deferred: string[] } = { processed: [], deferred: [] };
  for (const c of due) {
    if (c.quietHours && inQuietHours(now)) { result.deferred.push(c.id); continue; }
    await db.campaign.update({ where: { id: c.id }, data: { status: "pending" } });
    const phase = c.autoRollout ? ("test" as const) : undefined;
    processCampaign(c.id, phase).catch((e) => console.error("scheduled send error", e));
    result.processed.push(c.id);
  }
  return result;
}
