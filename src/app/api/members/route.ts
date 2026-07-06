import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { hashPassword } from "@/lib/user-service";

export const dynamic = "force-dynamic";

/** GET /api/members — 列出租户成员（admin 可见） */
export async function GET() {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const list = await db.appUser.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, status: true, createdAt: true },
  });
  return NextResponse.json(list);
}

/** POST /api/members — 邀请新成员 { email, name?, role?, password? }（admin）
 *  校验 maxUsers 配额（Plan.maxUsers）。 */
export async function POST(req: NextRequest) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }
  const VALID_ROLES = ["admin", "sales", "viewer"];
  const role = VALID_ROLES.includes(body.role) ? body.role : "sales";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 50) : null;
  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < 8) {
    return NextResponse.json({ error: "初始密码至少 8 位" }, { status: 400 });
  }

  // 查重
  const exist = await db.appUser.findFirst({ where: { email } });
  if (exist) return NextResponse.json({ error: "该邮箱已存在" }, { status: 409 });

  // maxUsers 配额校验
  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true } });
  const sub = await db.subscription.findFirst({
    where: { tenantId: session.tenantId, status: { in: ["active", "trialing"] } },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { maxUsers: true } } },
  });
  const maxUsers = sub?.plan?.maxUsers ?? 3;
  const currentCount = await db.appUser.count({ where: { tenantId: session.tenantId } });
  if (currentCount >= maxUsers) {
    return NextResponse.json({ error: `已达套餐成员上限（${maxUsers} 人），请升级套餐` }, { status: 402 });
  }

  const passwordHash = await hashPassword(password);
  const user = await db.appUser.create({
    data: { tenantId: session.tenantId, email, name, role, passwordHash, status: "active" },
    select: { id: true, email: true, name: true, role: true, status: true },
  });
  return NextResponse.json({ ok: true, user });
}
