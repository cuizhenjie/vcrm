import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { invalidateIntentCache } from "@/lib/intent-service";

export const dynamic = "force-dynamic";

/** PATCH /api/intent-keywords/[id] — 切换状态（admin） */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));
  const status = body.status === "active" ? "active" : "inactive";
  const r = await db.intentKeyword.updateMany({
    where: { id: params.id, tenantId: session.tenantId },
    data: { status },
  });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  invalidateIntentCache(session.tenantId);
  return NextResponse.json({ ok: true });
}

/** DELETE /api/intent-keywords/[id]（admin） */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const r = await db.intentKeyword.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  invalidateIntentCache(session.tenantId);
  return NextResponse.json({ ok: true });
}
