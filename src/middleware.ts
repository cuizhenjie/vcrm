import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getEdgeSessionSecret, verifyEdgeSession, SESSION_COOKIE } from "@/lib/edge-auth";

// 公开路径（无需登录）：登录、注册、外部回调、短链跳转、cron、健康检查、支付回调、公开配置
const PUBLIC_PREFIX = ["/login", "/register", "/api/login", "/api/register", "/api/webhooks", "/api/cron", "/api/health", "/api/payment/callback", "/api/config", "/s/"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PREFIX.some((p) => pathname === p || pathname.startsWith(p))) return NextResponse.next();

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const secret = getEdgeSessionSecret();
  if (await verifyEdgeSession(token, secret)) return NextResponse.next();

  if (pathname.startsWith("/api")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}
export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
