import { NextResponse } from "next/server";
import { getProvider } from "@/lib/sms";

export const dynamic = "force-dynamic";

// 通道联调自检：返回当前通道、配置完整性、余额（真实通道）
export async function GET() {
  const provider = getProvider();
  const isLianlu = provider.name === "lianlu";
  const required = ["LIANLU_BASE_URL", "LIANLU_MCH_ID", "LIANLU_APP_ID", "LIANLU_API_KEY", "LIANLU_SIGN_NAME"];
  const missing = isLianlu ? required.filter((k) => !process.env[k]) : [];

  let balance: { ok: boolean; balance?: number; raw?: unknown } | null = null;
  if (isLianlu && missing.length === 0 && provider.balance) {
    try { balance = await provider.balance(); } catch { balance = { ok: false }; }
  }
  return NextResponse.json({
    provider: provider.name,
    ready: missing.length === 0,
    missingEnv: missing,
    balance,
    note: isLianlu ? "联麓签名已按 Signature 文档实现；发送路径/成功字段/messageId 仍需以发送 API 文档或联调确认为准" : "当前为 mock 通道，配置 SMS_PROVIDER=lianlu 切换真实通道",
  });
}
