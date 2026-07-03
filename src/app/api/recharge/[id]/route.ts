import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** GET /api/recharge/[id] — 查询充值订单状态（前端轮询支付结果） */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const order = await db.paymentOrder.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
    select: {
      id: true,
      status: true,
      amountFen: true,
      smsQuantity: true,
      provider: true,
      payUrl: true,
      tradeNo: true,
      paidAt: true,
      createdAt: true,
    },
  });
  if (!order) return NextResponse.json({ error: "订单不存在" }, { status: 404 });
  return NextResponse.json({ ok: true, order });
}
