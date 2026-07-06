import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/invoices — 列出租户的账单/发票 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db.invoice.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(list.map((inv) => ({
    ...inv,
    amountYuan: (inv.amountFen / 100).toFixed(2),
  })));
}
