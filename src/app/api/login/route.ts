import { NextRequest, NextResponse } from "next/server";
import { getSessionSecret, signSession, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/auth";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  if (password !== (process.env.APP_PASSWORD ?? "admin"))
    return NextResponse.json({ error: "密码错误" }, { status: 401 });

  // 签名 session：HMAC(payload, secret)，无法被简单复制
  const token = signSession(getSessionSecret());
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    maxAge: SESSION_TTL_SEC,
  });
  return res;
}
