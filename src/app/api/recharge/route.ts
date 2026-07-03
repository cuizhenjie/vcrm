import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { createRechargeOrder } from "@/lib/payment-service";
import { listProviders, getPaymentProvider } from "@/lib/payment";

export const dynamic = "force-dynamic";

/** GET /api/recharge — 返回可用支付渠道与单价 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const providers = listProviders();
  const unitCostFen = Number(process.env.SMS_UNIT_COST ?? 0.05) * 100;
  return NextResponse.json({
    providers: providers.filter((p) => p.configured || p.name === "mock"),
    unitCostFen: Math.round(unitCostFen),
    currency: "CNY",
  });
}

/** POST /api/recharge — 创建充值订单 { quantity, provider } */
export async function POST(req: NextRequest) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const quantity = Number(body.quantity);
  const provider = String(body.provider ?? "").trim();
  if (!Number.isFinite(quantity) || quantity < 1) {
    return NextResponse.json({ error: "充值数量需为正整数" }, { status: 400 });
  }

  try {
    const result = await createRechargeOrder({
      tenantId: session.tenantId,
      userId: session.userId,
      quantity,
      provider,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "下单失败" },
      { status: 400 },
    );
  }
}
