import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { invalidateSensitiveCache } from "@/lib/compliance";

export const dynamic = "force-dynamic";

/** DELETE /api/sensitive-words/[id] — 删除敏感词 */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const r = await db.sensitiveWord.deleteMany({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  invalidateSensitiveCache(session.tenantId);
  return NextResponse.json({ ok: true });
}

/** PATCH /api/sensitive-words/[id] — 切换状态(active/inactive) */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));
  const status = body.status === "active" ? "active" : "inactive";
  const r = await db.sensitiveWord.updateMany({
    where: { id: params.id, tenantId: session.tenantId },
    data: { status },
  });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  invalidateSensitiveCache(session.tenantId);
  return NextResponse.json({ ok: true });
}
