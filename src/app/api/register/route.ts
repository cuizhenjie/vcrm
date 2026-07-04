import { NextRequest, NextResponse } from "next/server";
import { getSessionSecret, signSession, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";
import { registerTenant, RegisterError } from "@/lib/user-service";
import { validate, registerSchema } from "@/lib/schemas";

export const dynamic = "force-dynamic";

/**
 * 注册新租户：创建租户 + owner 用户 + 试用订阅 + 初始额度。
 * 注册成功后直接签发登录 session（无需再跳登录）。
 * 可通过 REGISTER_ENABLED=false 关闭注册（暂停获客）。
 */
export async function POST(req: NextRequest) {
  if (process.env.REGISTER_ENABLED === "false") {
    return NextResponse.json({ error: "注册已暂停" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const checked = validate(registerSchema, body);
  if (!checked.success) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const { slug, tenantName, email, userName, password } = checked.data;

  try {
    const { tenant, user } = await registerTenant({ slug, tenantName: tenantName ?? "", email, userName: userName ?? "", password });
    const identity = { userId: user.id, tenantId: tenant.id, role: user.role };
    const token = signSession(getSessionSecret(), identity);
    const res = NextResponse.json({ ok: true, tenantId: tenant.id });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: SESSION_TTL_SEC,
    });
    return res;
  } catch (e) {
    if (e instanceof RegisterError) {
      return NextResponse.json({ error: e.message }, { status: 409 });
    }
    console.error("[register] error", e);
    return NextResponse.json({ error: "注册失败，请重试" }, { status: 500 });
  }
}
