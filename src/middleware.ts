import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 公开路径（无需登录）：登录、外部回调、短链跳转、cron
const PUBLIC_PREFIX = ["/login", "/api/login", "/api/webhooks", "/api/cron", "/s/"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIX.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const session = req.cookies.get("vcrm_session")?.value;
  if (session && session === (process.env.AUTH_SECRET ?? "dev-secret")) return NextResponse.next();

  if (pathname.startsWith("/api")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
