import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET() {
  const [totalCustomers, totalCampaigns, totalSent, totalVisited, totalDelivered] = await Promise.all([
    db.customer.count({ where: { isBlacklist: false } }),
    db.campaign.count(),
    db.recipient.count({ where: { sendStatus: "sent" } }),
    db.recipient.count({ where: { visited: true } }),
    db.recipient.count({ where: { deliveryStatus: "delivered" } }),
  ]);

  // 近14天发送趋势（JS 端按日期分桶，兼容 SQLite）
  const since = new Date(Date.now() - 13 * 86400_000); since.setHours(0, 0, 0, 0);
  const sentRows = await db.recipient.findMany({
    where: { sendStatus: "sent", createdAt: { gte: since } }, select: { createdAt: true, visited: true },
  });
  const days: { date: string; sent: number; clicks: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(since.getTime() + i * 86400_000);
    const key = `${d.getMonth() + 1}/${d.getDate()}`;
    const dayRows = sentRows.filter((r) => { const rd = new Date(r.createdAt); return rd.toDateString() === d.toDateString(); });
    days.push({ date: key, sent: dayRows.length, clicks: dayRows.filter((r) => r.visited).length });
  }

  // 活动 CTR 排行（已发送的）
  const campaigns = await db.campaign.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  const ranked = await Promise.all(campaigns.map(async (c) => {
    const [sent, visited] = await Promise.all([
      db.recipient.count({ where: { campaignId: c.id, sendStatus: "sent" } }),
      db.recipient.count({ where: { campaignId: c.id, visited: true } }),
    ]);
    return { id: c.id, name: c.name, sent, visited, ctr: sent ? visited / sent : 0 };
  }));
  const topCampaigns = ranked.filter((c) => c.sent > 0).sort((a, b) => b.ctr - a.ctr).slice(0, 8);

  const overallCtr = totalSent ? totalVisited / totalSent : 0;
  return NextResponse.json({
    summary: { totalCustomers, totalCampaigns, totalSent, totalVisited, totalDelivered, overallCtr },
    days, topCampaigns,
  });
}
