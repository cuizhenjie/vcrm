import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { validatePublicUrl } from "@/lib/ssrf-guard";

export const dynamic = "force-dynamic";

/** PATCH /api/webhook-endpoints/[id] — 更新（含切换 active/inactive）或更新 secret */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 100);
  if (typeof body.url === "string") {
    const urlErr = validatePublicUrl(body.url.trim());
    if (urlErr) return NextResponse.json({ error: urlErr }, { status: 400 });
    data.url = body.url.trim().slice(0, 500);
  }
  if (body.status === "active" || body.status === "inactive") data.status = body.status;
  if (typeof body.secret === "string" && body.secret.trim()) data.secret = body.secret.trim().slice(0, 200);
  if (Array.isArray(body.eventTypes)) {
    const types = body.eventTypes.filter((t: any) => typeof t === "string").slice(0, 50);
    data.eventTypes = JSON.stringify(types);
  }

  const r = await db.webhookEndpoint.updateMany({
    where: { id: params.id, tenantId: session.tenantId },
    data,
  });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/webhook-endpoints/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const r = await db.webhookEndpoint.deleteMany({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
