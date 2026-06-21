import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: { template: true, recipients: { take: 100, orderBy: { createdAt: "desc" } } },
  });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [sent, failed, filtered, visited, delivered, intent] = await Promise.all([
    db.recipient.count({ where: { campaignId: params.id, sendStatus: "sent" } }),
    db.recipient.count({ where: { campaignId: params.id, sendStatus: "failed" } }),
    db.recipient.count({ where: { campaignId: params.id, sendStatus: "filtered" } }),
    db.recipient.count({ where: { campaignId: params.id, visited: true } }),
    db.recipient.count({ where: { campaignId: params.id, deliveryStatus: "delivered" } }),
    db.recipient.count({ where: { campaignId: params.id, intentTag: "有意向" } }),
  ]);
  return NextResponse.json({ campaign, intent, stats: { sent, failed, filtered, visited, delivered, total: campaign.total } });
}
