import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { hashPassword } from "@/lib/user-service";

export const dynamic = "force-dynamic";

/** PATCH /api/members/[id] — 改角色 / 改状态 / 重置密码（admin）。
 *  保护：不能改自己角色（防自降权锁死），不能禁用最后一个 owner。 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const tid = session.tenantId;
  const body = await req.json().catch(() => ({}));

  const target = await db.appUser.findFirst({ where: { id: params.id, tenantId: tid } });
  if (!target) return NextResponse.json({ error: "成员不存在" }, { status: 404 });

  const data: Record<string, unknown> = {};

  // 改角色
  if (typeof body.role === "string" && ["admin", "sales", "viewer", "owner"].includes(body.role)) {
    // 不能改自己的角色（防自降权/自提权锁死）
    if (target.id === session.userId) {
      return NextResponse.json({ error: "不能修改自己的角色" }, { status: 400 });
    }
    // 降级最后一个 owner 需阻止
    if (target.role === "owner" && body.role !== "owner") {
      const ownerCount = await db.appUser.count({ where: { tenantId: tid, role: "owner", status: "active" } });
      if (ownerCount <= 1) return NextResponse.json({ error: "不能降级最后一个 owner" }, { status: 400 });
    }
    data.role = body.role;
  }

  // 改状态
  if (body.status === "active" || body.status === "inactive") {
    if (target.id === session.userId && body.status === "inactive") {
      return NextResponse.json({ error: "不能禁用自己" }, { status: 400 });
    }
    data.status = body.status;
  }

  // 改名字
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 50) || null;

  // 重置密码
  if (typeof body.password === "string" && body.password.length >= 8) {
    data.passwordHash = await hashPassword(body.password);
  }

  if (Object.keys(data).length === 0) return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  await db.appUser.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/members/[id] — 删除成员（不能删自己/最后一个 owner） */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const tid = session.tenantId;

  const target = await db.appUser.findFirst({ where: { id: params.id, tenantId: tid } });
  if (!target) return NextResponse.json({ error: "成员不存在" }, { status: 404 });
  if (target.id === session.userId) {
    return NextResponse.json({ error: "不能删除自己" }, { status: 400 });
  }
  if (target.role === "owner") {
    const ownerCount = await db.appUser.count({ where: { tenantId: tid, role: "owner", status: "active" } });
    if (ownerCount <= 1) return NextResponse.json({ error: "不能删除最后一个 owner" }, { status: 400 });
  }
  await db.appUser.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
