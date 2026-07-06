import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { createRechargeOrder } from "@/lib/payment-service";
import { listProviders } from "@/lib/payment";
import { smsUnitCostFen } from "@/lib/billing";
import { validate, rechargeSchema } from "@/lib/schemas";
import { requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** GET /api/recharge — 返回可用支付渠道与单价 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const providers = listProviders();
  return NextResponse.json({
    providers: providers.filter((p) => p.configured || p.name === "mock"),
    unitCostFen: smsUnitCostFen(),
    currency: "CNY",
  });
}

/** POST /api/recharge — 创建充值订单 { quantity, provider }（需 admin 及以上） */
export async function POST(req: NextRequest) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;

  const body = await req.json().catch(() => ({}));
  const checked = validate(rechargeSchema, body);
  if (!checked.success) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const { quantity, provider } = checked.data;

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
