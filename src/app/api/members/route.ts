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
  if (exist) return NextResponse.json({ error: "该邮箱不可用" }, { status: 409 });

  // 租户状态校验（suspended 租户不能邀请新成员）
  const tenant = await db.tenant.findUnique({ where: { id: session.tenantId }, select: { status: true } });
  if (tenant?.status !== "active") {
    return NextResponse.json({ error: "租户状态异常，无法邀请新成员" }, { status: 403 });
  }

  // 查套餐配额
  const sub = await db.subscription.findFirst({
    where: { tenantId: session.tenantId, status: { in: ["active", "trialing"] } },
    orderBy: { createdAt: "desc" },
    include: { plan: { select: { maxUsers: true } } },
  });
  const maxUsers = sub?.plan?.maxUsers ?? 3;

  // 事务内 count + create，防并发绕过配额（create 后二次校验，超限回滚）
  const passwordHash = await hashPassword(password);
  let user;
  try {
    user = await db.$transaction(async (tx) => {
      const created = await tx.appUser.create({
        data: { tenantId: session.tenantId, email, name, role, passwordHash, status: "active" },
        select: { id: true, email: true, name: true, role: true, status: true },
      });
      const count = await tx.appUser.count({ where: { tenantId: session.tenantId } });
      if (count > maxUsers) throw new Error("EXCEED_QUOTA");
      return created;
    });
  } catch (e) {
    if (e instanceof Error && e.message === "EXCEED_QUOTA") {
      return NextResponse.json({ error: `已达套餐成员上限（${maxUsers} 人），请升级套餐` }, { status: 402 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true, user });
}
