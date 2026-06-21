import { NextResponse } from "next/server";
import { getProvider } from "@/lib/sms";

export const dynamic = "force-dynamic";

// 通道联调自检：返回当前通道、配置完整性、余额（真实通道）
export async function GET() {
  const provider = getProvider();
  const isLianlu = provider.name === "lianlu";
  const required = ["LIANLU_BASE_URL", "LIANLU_ACCOUNT", "LIANLU_API_KEY", "LIANLU_SIGN"];
  const missing = isLianlu ? required.filter((k) => !process.env[k]) : [];

  let balance: any = null;
  if (isLianlu && missing.length === 0 && provider.balance) {
    try { balance = await provider.balance(); } catch { balance = { ok: false }; }
  }
  return NextResponse.json({
    provider: provider.name,
    ready: missing.length === 0,
    missingEnv: missing,
    balance,
    note: isLianlu ? "⚠ 请确认 api_4_2 文档的端点/签名/成功字段与 .env 一致" : "当前为 mock 通道，配置 SMS_PROVIDER=lianlu 切换真实通道",
  });
}
