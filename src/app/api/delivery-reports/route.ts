import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/delivery-reports — 送达回执列表（可选 campaignId 筛选） */
export async function GET(req: NextRequest) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const status = searchParams.get("status"); // delivered | undelivered

  const reports = await db.deliveryReport.findMany({
    where: {
      tenantId: session.tenantId,
      ...(status ? { status } : {}),
      ...(campaignId ? { recipient: { campaignId } } : {}),
    },
    orderBy: { reportedAt: "desc" },
    take: 200,
    include: { recipient: { select: { mobile: true, campaignId: true } } },
  });
  return NextResponse.json(reports);
}
