import { NextRequest, NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  if (password !== (process.env.APP_PASSWORD ?? "admin"))
    return NextResponse.json({ error: "密码错误" }, { status: 401 });
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vcrm_session", process.env.AUTH_SECRET ?? "dev-secret", {
    httpOnly: true, path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
