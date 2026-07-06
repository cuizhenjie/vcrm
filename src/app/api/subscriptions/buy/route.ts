import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { createSubscriptionOrder } from "@/lib/plan-service";

export const dynamic = "force-dynamic";

/** POST /api/subscriptions/buy — 购买/升级套餐 { planCode, provider? }（需 admin） */
export async function POST(req: NextRequest) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;

  const body = await req.json().catch(() => ({}));
  const planCode = typeof body.planCode === "string" ? body.planCode.trim() : "";
  const provider = typeof body.provider === "string" ? body.provider.trim() : undefined;
  if (!planCode) return NextResponse.json({ error: "planCode 必填" }, { status: 400 });

  try {
    const result = await createSubscriptionOrder({
      tenantId: session.tenantId,
      userId: session.userId,
      planCode,
      provider,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "下单失败" }, { status: 400 });
  }
}
