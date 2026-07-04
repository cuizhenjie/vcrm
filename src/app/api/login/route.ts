import { NextRequest, NextResponse } from "next/server";
import { getSessionSecret, signSession, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";
import { loginByCredentials } from "@/lib/user-service";
import { db } from "@/lib/db";
import { validate, loginSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * 登录：优先按 AppUser(email+password) 校验；
 * 若系统中没有任何 AppUser 且配置了 APP_PASSWORD，回落为单管理员兼容模式。
 * session token 携带 userId/tenantId/role，cookie 设 secure(生产)。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const checked = validate(loginSchema, body);
  if (!checked.success) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const { email, password } = checked.data;

  let identity: { userId: string; tenantId: string; role: string } | null = null;

  // 1. 优先走 AppUser 登录
  identity = await loginByCredentials(email, password);

  // 2. 兼容模式：无任何 AppUser 时，用环境变量单管理员密码登录 default_tenant
  if (!identity) {
    const hasUsers = await db.appUser.count();
    const envPwd = process.env.APP_PASSWORD;
    // 仅当系统无用户且配了 env 密码时启用（防止多租户环境下被旁路）
    if (hasUsers === 0 && envPwd && envPwd !== "admin" && password === envPwd) {
      identity = { userId: "env-admin", tenantId: "default_tenant", role: "owner" };
    }
  }

  if (!identity) {
    return NextResponse.json({ error: "邮箱或密码错误" }, { status: 401 });
  }

  const token = signSession(getSessionSecret(), identity);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}
