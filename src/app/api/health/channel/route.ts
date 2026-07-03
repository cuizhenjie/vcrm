import { NextResponse } from "next/server";
import { getProvider } from "@/lib/sms";

export const dynamic = "force-dynamic";

/**
 * 通道联调自检：返回当前通道、配置完整性、余额、回执闭环关键项检查清单。
 * 这是联麓真实联调的诊断入口——任何一项 false 都说明闭环未打通。
 */
export async function GET() {
  const provider = getProvider();
  const isLianlu = provider.name === "lianlu";

  // 1. 基础凭证完整性
  const required = ["LIANLU_BASE_URL", "LIANLU_MCH_ID", "LIANLU_APP_ID", "LIANLU_API_KEY", "LIANLU_SIGN_NAME"];
  const missing = isLianlu ? required.filter((k) => !process.env[k]) : [];

  // 2. 余额
  let balance: { ok: boolean; balance?: number; raw?: unknown } | null = null;
  if (isLianlu && missing.length === 0 && provider.balance) {
    try { balance = await provider.balance(); } catch { balance = { ok: false }; }
  }

  // 3. 回执闭环关键项（联调诊断用）
  const closedLoop = {
    messageIdFieldConfigured: !!process.env.LIANLU_MESSAGE_ID_FIELD?.trim(),
    webhookSecretConfigured: !!process.env.LIANLU_WEBHOOK_SECRET?.trim(),
    sendPathConfigured: !!(process.env.LIANLU_SEND_PATH?.trim() || "/sms/product/sendSMS"),
    webhookUrlsReachable: null as boolean | null, // 需要联麓控制台配置回调地址，此处仅提示
  };

  // 4. 联调清单（拿到联麓文档后逐项确认）
  const checklist = isLianlu
    ? [
        "发送路径 LIANLU_SEND_PATH（默认 /sms/product/sendSMS，需文档确认）",
        "成功判定 LIANLU_SUCCESS_FIELD/LIANLU_SUCCESS_VALUE（默认 code==0，需文档确认）",
        "流水号字段 LIANLU_MESSAGE_ID_FIELD（必须配置，否则回执无法关联 → 闭环断裂）",
        "回执字段 LIANLU_DELIVERY_MESSAGE_ID_FIELD/STATUS_FIELD（按真实回执结构配置）",
        "Webhook 签名密钥 LIANLU_WEBHOOK_SECRET（联麓控制台配置回调后下发）",
        "Webhook 回调地址：在联麓控制台填入本站 /api/webhooks/delivery 和 /api/webhooks/mo",
        "extno/Tag 长度限制：真实联麓 Tag 可能有长度/格式限制，超长会被通道拒收",
      ]
    : ["当前为 mock 通道，配置 SMS_PROVIDER=lianlu 切换真实通道"];

  return NextResponse.json({
    provider: provider.name,
    ready: missing.length === 0,
    missingEnv: missing,
    balance,
    closedLoop,
    checklist,
    note: isLianlu
      ? "联麓签名已按 Signature 文档实现；closedLoop 标记回执闭环是否就绪，checklist 是联调待确认项"
      : "当前为 mock 通道",
  });
}
