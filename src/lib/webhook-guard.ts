import { NextRequest, NextResponse } from "next/server";
import { verifyLianluSignature } from "./auth";

/**
 * 联麓 Webhook 入口统一守卫：
 * - 生产环境：LIANLU_WEBHOOK_SECRET 必须配置且必须校验通过，否则拒绝。
 * - 开发环境（NODE_ENV !== production）：允许未配置 secret 时放行（便于 mock 联调），
 *   但只要配置了 secret 就必须校验通过（防止 dev 环境误暴露成可伪造入口）。
 *
 * 用法：
 *   const guard = requireWebhookSignature(req);
 *   if (guard) return guard; // 401
 */
export function requireWebhookSignature(req: NextRequest, rawBody: string): NextResponse | null {
  const appSecret = process.env.LIANLU_WEBHOOK_SECRET ?? "";
  const isProd = process.env.NODE_ENV === "production";

  // 生产环境：secret 必须配置；未配置视为配置错误，直接拒绝（fail-closed）
  if (isProd && !appSecret) {
    return NextResponse.json({ error: "webhook secret not configured" }, { status: 500 });
  }
  // 未配置 secret 仅在非生产放行（dev/mock 联调）
  if (!appSecret) return null;

  const sig = req.headers.get("x-lianlu-signature");
  if (!verifyLianluSignature(rawBody, sig, appSecret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  return null;
}
