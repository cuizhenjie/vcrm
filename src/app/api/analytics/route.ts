import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conversionFunnel } from "@/lib/funnel";
import { listFollowLogs } from "@/lib/follow-logs";
import { campaignRoi, orgRoi } from "@/lib/roi";
import { currentTenantId } from "@/lib/tenant";
export const dynamic = "force-dynamic";

export async function GET() {
  const tenantId = currentTenantId();
  const [totalCustomers, totalCampaigns, totalSent, totalVisited, totalDelivered, funnel, recentFollowLogs, roi, topCampaigns] = await Promise.all([
    db.customer.count({ where: { tenantId, isBlacklist: false } }),
    db.campaign.count({ where: { tenantId } }),
    db.recipient.count({ where: { tenantId, sendStatus: "sent" } }),
    db.recipient.count({ where: { tenantId, visited: true } }),
    db.recipient.count({ where: { tenantId, deliveryStatus: "delivered" } }),
    conversionFunnel(),
    listFollowLogs(),
    orgRoi(),
    campaignRoi(),
  ]);

  // 近14天发送趋势（JS 端按日期分桶，兼容 SQLite）
  const since = new Date(Date.now() - 13 * 86400_000); since.setHours(0, 0, 0, 0);
  const sentRows = await db.recipient.findMany({
    where: { tenantId, sendStatus: "sent", createdAt: { gte: since } }, select: { createdAt: true, visited: true },
  });
  const days: { date: string; sent: number; clicks: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since.getTime() + i * 86400_000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    const dayRows = sentRows.filter((r) => { const rd = new Date(r.createdAt); return rd.toDateString() === d.toDateString(); });
    days.push({ date: key, sent: dayRows.length, clicks: dayRows.filter((r) => r.visited).length });
  }

  const overallCtr = totalSent ? totalVisited / totalSent : 0;
  return NextResponse.json({
    summary: { totalCustomers, totalCampaigns, totalSent, totalVisited, totalDelivered, overallCtr },
    funnel, roi, recentFollowLogs, days, topCampaigns,
  });
}
