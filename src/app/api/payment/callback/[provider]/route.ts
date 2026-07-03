import { NextRequest, NextResponse } from "next/server";
import { handlePaymentCallback } from "@/lib/payment-service";

export const dynamic = "force-dynamic";

/**
 * 支付渠道异步回调入口：/api/payment/callback/{provider}
 * 公开路径（在 middleware PUBLIC_PREFIX 中），签名校验由 provider.verifyCallback 负责。
 * 支持 GET（部分渠道同步跳转）和 POST（异步通知）。
 */
async function handle(req: NextRequest, { params }: { params: { provider: string } }) {
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  const { status, body } = await handlePaymentCallback(params.provider, rawBody, headers);

  // mock 渠道用 JSON，微信用 XML，支付宝用纯文本 success
  const isJson = body.startsWith("{") || body.startsWith("[");
  return new NextResponse(body, {
    status,
    headers: { "Content-Type": isJson ? "application/json" : "text/plain" },
  });
}

export const POST = handle;
export const GET = handle;
