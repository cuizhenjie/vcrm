import { db } from "./db";
import { processCampaign } from "./tasks";

/** 是否处于避扰时段（跨午夜自动处理）。默认 22:00–08:00 不发。 */
export function inQuietHours(d = new Date()): boolean {
  const start = Number(process.env.QUIET_START ?? 22);
  const end = Number(process.env.QUIET_END ?? 8);
  const h = d.getHours();
  return start < end ? h >= start && h < end : h >= start || h < end;
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
