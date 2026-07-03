import { NextRequest, NextResponse } from "next/server";
import { getSessionSecret, signSession, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";
import { registerTenant, validateCredentials, validateSlug, RegisterError } from "@/lib/user-service";

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
  const slug = String(body.slug ?? "").trim();
  const tenantName = String(body.tenantName ?? "").trim();
  const email = String(body.email ?? "").trim();
  const userName = String(body.userName ?? "").trim();
  const password = String(body.password ?? "");

  const slugErr = validateSlug(slug);
  if (slugErr) return NextResponse.json({ error: slugErr }, { status: 400 });
  const credErr = validateCredentials(email, password);
  if (credErr) return NextResponse.json({ error: credErr }, { status: 400 });

  try {
    const { tenant, user } = await registerTenant({ slug, tenantName, email, userName, password });
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
