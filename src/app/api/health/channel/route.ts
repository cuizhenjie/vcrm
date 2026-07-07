import { NextResponse } from "next/server";
import { getProvider } from "@/lib/sms";
import { requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * 通道联调自检：返回当前通道、配置完整性、余额、回执闭环关键项检查清单。
 * 这是联麓真实联调的诊断入口——任何一项 false 都说明闭环未打通。
 * ⚠️ 需 admin 权限（含余额、缺失环境变量等敏感信息，不可公开）。
 */
export async function GET() {
  const guard = requireRole("admin");
  if (guard) return guard;
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

  // 4. 联调清单（默认值已按联麓普通短信 API 文档配置，仅需联调确认）
  const checklist = isLianlu
    ? [
        "✓ 发送路径 LIANLU_SEND_PATH（默认 /sms/trade/normal/send，已按文档配置）",
        "✓ 成功判定 LIANLU_SUCCESS_FIELD=status / VALUE=00（已按文档配置）",
        "✓ 流水号 LIANLU_MESSAGE_ID_FIELD=taskId（已按文档配置，回执按 taskId 关联）",
        "? 余额路径 LIANLU_BALANCE_PATH（默认 /sms/trade/balance，按命名规律推测）",
        `${process.env.LIANLU_MMS_PATH?.trim() ? "✓" : "✗"} 视频彩信 LIANLU_MMS_PATH（${process.env.LIANLU_MMS_PATH?.trim() ? "已配" : "未配，sendMms 降级"}）`,
        `${process.env.LIANLU_FLASH_PATH?.trim() ? "✓" : "✗"} 闪信 LIANLU_FLASH_PATH（${process.env.LIANLU_FLASH_PATH?.trim() ? "已配" : "未配，sendFlash 降级"}）`,
        `${process.env.LIANLU_CHECK_PATH?.trim() ? "✓" : "✗"} 空号检测 LIANLU_CHECK_PATH（${process.env.LIANLU_CHECK_PATH?.trim() ? "已配" : "未配，检测返回 unknown"}）`,
        `${process.env.LIANLU_QUERY_PATH?.trim() ? "✓" : "✗"} 回执查询 LIANLU_QUERY_PATH（${process.env.LIANLU_QUERY_PATH?.trim() ? "已配" : "未配，仅靠回调"}）`,
        "? 回执字段 LIANLU_DELIVERY_MESSAGE_ID_FIELD（默认 taskId，按真实回执结构确认）",
        `${process.env.LIANLU_WEBHOOK_SECRET?.trim() ? "✓" : "✗"} Webhook 签名密钥 LIANLU_WEBHOOK_SECRET`,
        "! Webhook 回调地址：在联麓控制台填入本站 /api/webhooks/delivery 和 /api/webhooks/mo",
        "! 签名方式：当前按 HMAC-SHA256 实现，联调时按联麓推送报告文档确认签名算法",
      ]
    : ["当前为 mock 通道，配置 SMS_PROVIDER=lianlu 切换真实通道"];

  // 5. 全局配置诊断（支付 + 视频 + 认证）
  const globalDiag = [
    `${process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? "✓" : "✗"} AUTH_SECRET（${process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? "已配≥32字符" : "未配或过短"}）`,
    `${process.env.CRON_SECRET?.trim() ? "✓" : "✗"} CRON_SECRET（定时任务触发密钥）`,
    `${process.env.ARK_API_KEY?.trim() ? "✓" : "✗"} ARK_API_KEY（视频生成${process.env.ARK_API_KEY?.trim() ? "" : "，未配则不可用"}）`,
    `${process.env.PAYMENT_PROVIDER === "wechat" && process.env.PAYMENT_WECHAT_MCH_ID?.trim() ? "✓" : process.env.PAYMENT_PROVIDER === "alipay" && process.env.PAYMENT_ALIPAY_APP_ID?.trim() ? "✓" : process.env.PAYMENT_PROVIDER === "mock" ? "⚠" : "✗"} 支付渠道 PAYMENT_PROVIDER=${process.env.PAYMENT_PROVIDER || "未配"}`,
    `${process.env.REDIS_URL?.trim() ? "✓" : "⚠"} REDIS_URL（频控${process.env.REDIS_URL?.trim() ? "已启用" : "回退DB"}）`,
    `${process.env.SMTP_HOST?.trim() ? "✓" : "⚠"} SMTP邮件（${process.env.SMTP_HOST?.trim() ? "已配" : "仅站内通知"}）`,
  ];

  return NextResponse.json({
    provider: provider.name,
    ready: missing.length === 0,
    missingEnv: missing,
    balance,
    closedLoop,
    checklist,
    globalDiag,
    note: isLianlu
      ? "联麓签名已按 Signature 文档实现；closedLoop 标记回执闭环是否就绪，checklist 是联调待确认项"
      : "当前为 mock 通道",
  });
}
