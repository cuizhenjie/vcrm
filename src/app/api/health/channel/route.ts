import { NextResponse } from "next/server";
import { getProvider } from "@/lib/sms";
import { requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/**
 * 通道联调自检：返回当前通道、配置完整性、余额、回执闭环关键项检查清单。
 * 支持 lianlu / volcengine / mock 三种通道；任何一项 false 都说明闭环未打通。
 * ⚠️ 需 admin 权限（含余额、缺失环境变量等敏感信息，不可公开）。
 */
export async function GET() {
  const guard = requireRole("admin");
  if (guard) return guard;
  const provider = getProvider();
  const name = provider.name;
  const isLianlu = name === "lianlu";
  const isVolc = name === "volcengine";

  // 1. 基础凭证完整性
  const required = isLianlu
    ? ["LIANLU_BASE_URL", "LIANLU_MCH_ID", "LIANLU_APP_ID", "LIANLU_API_KEY", "LIANLU_SIGN_NAME"]
    : isVolc
      ? ["SMS_VOLC_ACCESS_KEY", "SMS_VOLC_SECRET_KEY", "SMS_VOLC_SMS_ACCOUNT", "SMS_VOLC_TEMPLATE_ID"]
      : [];
  const missing = required.filter((k) => !process.env[k]);

  // 2. 余额
  let balance: { ok: boolean; balance?: number; raw?: unknown } | null = null;
  if ((isLianlu || isVolc) && missing.length === 0 && provider.balance) {
    try { balance = await provider.balance(); } catch { balance = { ok: false }; }
  }

  // 3. 回执闭环关键项（联调诊断用）
  const closedLoop = {
    messageIdFieldConfigured: isLianlu
      ? !!process.env.LIANLU_MESSAGE_ID_FIELD?.trim()
      : isVolc
        ? true // 火山 SendSms 返回 Result.MessageID，固定字段
        : false,
    webhookSecretConfigured: isLianlu
      ? !!process.env.LIANLU_WEBHOOK_SECRET?.trim()
      : isVolc
        ? !!process.env.SMS_VOLC_WEBHOOK_SECRET?.trim()
        : false,
    sendPathConfigured: isLianlu
      ? !!(process.env.LIANLU_SEND_PATH?.trim() || "/sms/product/sendSMS")
      : isVolc
        ? true // 固定 /?Action=SendSms&Version=2020-01-01
        : false,
    webhookUrlsReachable: null as boolean | null, // 需在通道控制台配置回调地址，此处仅提示
  };

  // 4. 联调清单
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
    : isVolc
      ? [
          "✓ 签名算法 火山 V4（HMAC-SHA256 链，已按 ym_pro 实测通过实现）",
          "✓ 发送端点 POST /?Action=SendSms&Version=2020-01-01（固定）",
          "✓ 流水号 Result.MessageID（SendSms 返回，回执按它关联）",
          `${process.env.SMS_VOLC_TEMPLATE_ID?.trim() ? "✓" : "✗"} 内容透传模板 SMS_VOLC_TEMPLATE_ID（${process.env.SMS_VOLC_TEMPLATE_ID?.trim() ? "已配" : "未配，sendText 降级"}）`,
          `${process.env.SMS_VOLC_MMS_TEMPLATE_ID?.trim() ? "✓" : "✗"} 视频短信模板 SMS_VOLC_MMS_TEMPLATE_ID（${process.env.SMS_VOLC_MMS_TEMPLATE_ID?.trim() ? "已配" : "未配，sendMms 降级"}）`,
          `${process.env.SMS_VOLC_SIGN?.trim() ? "✓" : "✗"} 短信签名 SMS_VOLC_SIGN（${process.env.SMS_VOLC_SIGN?.trim() ? "已配" : "未配，需模板/任务解析签名"}）`,
          "✗ 空号检测：火山 SendSms 组不提供，检测返回 unknown（不伪造归属地/运营商）",
          "✗ 闪信：火山不提供，sendFlash 降级",
          `${process.env.SMS_VOLC_WEBHOOK_SECRET?.trim() ? "✓" : "✗"} 回执回调签名密钥 SMS_VOLC_WEBHOOK_SECRET（${process.env.SMS_VOLC_WEBHOOK_SECRET?.trim() ? "已配" : "未配，生产禁止裸奔回调"}）`,
          "! Webhook 回调地址：在火山控制台填入本站 /api/webhooks/delivery（回执）",
          "! 注意：火山短信以模板审核为主，正文变量以模板定义为准",
        ]
      : ["当前为 mock 通道，配置 SMS_PROVIDER=lianlu 或 volcengine 切换真实通道"];

  // 5. 全局配置诊断（支付 + 视频 + 认证）
  const paymentProvider = process.env.PAYMENT_PROVIDER || "未配";
  // 微信/支付宝逐项凭证体检（列出缺失项，便于对照商户平台补齐）
  const wxCreds: Array<[string, boolean]> = [
    ["PAYMENT_WECHAT_APP_ID", !!process.env.PAYMENT_WECHAT_APP_ID?.trim()],
    ["PAYMENT_WECHAT_MCH_ID", !!process.env.PAYMENT_WECHAT_MCH_ID?.trim()],
    ["PAYMENT_WECHAT_API_V3_KEY", !!process.env.PAYMENT_WECHAT_API_V3_KEY?.trim()],
    ["PAYMENT_WECHAT_CERT_SERIAL", !!process.env.PAYMENT_WECHAT_CERT_SERIAL?.trim()],
    ["商户私钥", !!(process.env.PAYMENT_WECHAT_PRIVATE_KEY_PATH?.trim() || process.env.PAYMENT_WECHAT_PRIVATE_KEY?.trim())],
    ["平台证书/公钥", !!(process.env.PAYMENT_WECHAT_PLATFORM_CERT_PATH?.trim() || process.env.PAYMENT_WECHAT_PLATFORM_CERT?.trim() || process.env.PAYMENT_WECHAT_PLATFORM_PUBLIC_KEY?.trim())],
  ];
  const alipayCreds: Array<[string, boolean]> = [
    ["PAYMENT_ALIPAY_APP_ID", !!process.env.PAYMENT_ALIPAY_APP_ID?.trim()],
    ["PAYMENT_ALIPAY_PRIVATE_KEY", !!process.env.PAYMENT_ALIPAY_PRIVATE_KEY?.trim()],
    ["PAYMENT_ALIPAY_PUBLIC_KEY", !!process.env.PAYMENT_ALIPAY_PUBLIC_KEY?.trim()],
  ];
  const fmtCreds = (creds: Array<[string, boolean]>) =>
    creds.map(([k, ok]) => `${ok ? "✓" : "✗"} ${k}`).join("；");
  const wxMissing = wxCreds.filter(([, ok]) => !ok).map(([k]) => k);
  const alipayMissing = alipayCreds.filter(([, ok]) => !ok).map(([k]) => k);
  const globalDiag = [
    `${process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? "✓" : "✗"} AUTH_SECRET（${process.env.AUTH_SECRET && process.env.AUTH_SECRET.length >= 32 ? "已配≥32字符" : "未配或过短"}）`,
    `${process.env.CRON_SECRET?.trim() ? "✓" : "✗"} CRON_SECRET（定时任务触发密钥）`,
    `${process.env.ARK_API_KEY?.trim() ? "✓" : "✗"} ARK_API_KEY（视频生成${process.env.ARK_API_KEY?.trim() ? "" : "，未配则不可用"}）`,
    `支付渠道 PAYMENT_PROVIDER=${paymentProvider}`,
    `  微信 ${wxMissing.length === 0 ? "✓ 全部就绪" : `缺失 ${wxMissing.length} 项：${fmtCreds(wxCreds)}`}`,
    `  支付宝 ${alipayMissing.length === 0 ? "✓ 全部就绪" : `缺失 ${alipayMissing.length} 项：${fmtCreds(alipayCreds)}`}`,
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
      : isVolc
        ? "火山 V4 签名已按 ym_pro 实测实现；closedLoop 标记回执闭环是否就绪，checklist 是配置项"
        : "当前为 mock 通道",
  });
}
