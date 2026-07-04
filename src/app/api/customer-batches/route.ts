import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/customer-batches — 列出批次（含检测状态/空号统计） */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const batches = await db.customerBatch.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // 附带每批次的空号/黑名单统计
  const enriched = await Promise.all(
    batches.map(async (b) => {
      const empty = await db.customer.count({ where: { batchId: b.id, isBlacklist: true } });
      return { ...b, emptyCount: empty };
    }),
  );
  return NextResponse.json(enriched);
}
