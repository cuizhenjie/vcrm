import crypto from "node:crypto";
import type {
  SmsChannelProvider,
  TextSmsReq,
  MmsReq,
  FlashReq,
  CheckResult,
  SendResult,
  DeliveryReport,
} from "./types";

/**
 * 火山引擎短信（volcSMS）通道 —— 按官方文档 + ym_pro 实测实现。
 *
 * 签名：火山引擎 API V4（AWS SigV4 风格，HMAC-SHA256 链）。
 *   CanonicalRequest → StringToSign → Signature
 *   凭证作用域服务名 volcSMS（与网关域名 sms.volcengineapi.com 不同，已实测确认）。
 *
 * 端点（SendSms 属 2020-01-01 版本组，模板/账号管理才是 2021-01-11）：
 *   - POST https://sms.volcengineapi.com/?Action=SendSms&Version=2020-01-01
 *   - SignedHeaders: content-type;host;x-date
 *   - 请求体：{ SmsAccount, Sign, TemplateID, TemplateParam(JSON串), PhoneNumbers(逗号串) }
 *   - 成功判定：HTTP 2xx 且 ResponseMetadata.Error 为空；流水号 Result.MessageID[0]
 *
 * 内容映射：vcrm-touch 是「自由文本 + 每收件人唯一短链」的发送模型，
 *   而火山短信必须走「预审核模板 + 变量参数」。因此火山侧需配置一个
 *   「内容透传模板」（正文仅含 {1} 占位），发送时把整条渲染后的正文作为 {1} 传入。
 *   SMS_VOLC_TEMPLATE_ID 即该模板 ID（控制台申请审核通过后配置）。
 *
 * 能力边界（诚实降级，不伪造）：
 *   - 空号检测/归属地：火山 SendSms 组不提供，返回 unknown（页面不再展示假归属地）
 *   - 回执主动查询：火山以回调为主，QuerySendStatus 未配置时返回 unknown
 *   - 余额：不通过 SendSms 组暴露，返回未配置（不伪造 99999）
 *   - 视频彩信/闪信：未配置独立模板/路径时返回 unsupported
 */
const VOLC_SMS_HOST = "sms.volcengineapi.com";
const VOLC_REGION = "cn-north-1";
const VOLC_SERVICE = "volcSMS";

const env = (k: string, d = ""): string => process.env[k] ?? d;
const numberEnv = (k: string, fallback: number): number => {
  const v = env(k);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

// ---- 签名 -----------------------------------------------------------------

const sha256Hex = (data: string): string =>
  crypto.createHash("sha256").update(data).digest("hex");

const hmac = (key: string | Buffer, data: string): Buffer =>
  crypto.createHmac("sha256", key).update(data).digest();

/**
 * 火山引擎 V4 签名（与 ym_pro 实测通过的实现一致）。
 * SignedHeaders: content-type;host;x-date；Credential scope 服务名 volcSMS。
 */
export const volcSign = (args: {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: string;
  accessKey: string;
  secretKey: string;
  date: Date;
}): string => {
  const { method, path, query, headers, body, accessKey, secretKey, date } = args;
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);

  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join("&");

  const signedHeaderNames = ["content-type", "host", "x-date"];
  const canonicalHeaders = signedHeaderNames.map((h) => `${h}:${headers[h]}\n`).join("");
  const signedHeaders = signedHeaderNames.join(";");
  const hashedPayload = sha256Hex(body);

  const canonicalRequest = [
    method,
    path,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join("\n");

  const credentialScope = `${dateStamp}/${VOLC_REGION}/${VOLC_SERVICE}/request`;
  const stringToSign = [
    "HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  let key = hmac(secretKey, dateStamp);
  key = hmac(key, VOLC_REGION);
  key = hmac(key, VOLC_SERVICE);
  key = hmac(key, "request");
  const signature = crypto.createHmac("sha256", key).update(stringToSign).digest("hex");

  return `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
};

// ---- 配置 -----------------------------------------------------------------

const accessKey = (): string => env("SMS_VOLC_ACCESS_KEY").trim();
const secretKey = (): string => env("SMS_VOLC_SECRET_KEY").trim();
const smsAccount = (): string => env("SMS_VOLC_SMS_ACCOUNT").trim();
const defaultSign = (): string => env("SMS_VOLC_SIGN").trim();
const contentTemplateId = (): string => env("SMS_VOLC_TEMPLATE_ID").trim();
const host = (): string => env("SMS_VOLC_HOST", VOLC_SMS_HOST).trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");

const missingConfig = (): string[] =>
  (
    [
      ["SMS_VOLC_ACCESS_KEY", accessKey()],
      ["SMS_VOLC_SECRET_KEY", secretKey()],
      ["SMS_VOLC_SMS_ACCOUNT", smsAccount()],
      ["SMS_VOLC_TEMPLATE_ID", contentTemplateId()],
    ] as Array<[string, string]>
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

/** 规范化签名：去掉【】（火山 Sign 字段不含括号，与签名报备一致）。 */
const normalizeSign = (name?: string): string =>
  (name ?? defaultSign()).trim().replace(/^[【\[]+|[】\]]+$/g, "");

// ---- HTTP 调用 ------------------------------------------------------------

type VolcCallOptions = { templateId: string; templateParam?: Record<string, string>; signName?: string };

async function callSendSms(mobiles: string[], opts: VolcCallOptions): Promise<SendResult> {
  const missing = missingConfig();
  if (missing.length > 0) return { ok: false, code: "CONFIG_MISSING", raw: { missingEnv: missing } };

  const body = JSON.stringify({
    SmsAccount: smsAccount(),
    Sign: normalizeSign(opts.signName),
    TemplateID: opts.templateId,
    TemplateParam: JSON.stringify(opts.templateParam ?? {}),
    PhoneNumbers: mobiles.join(","),
  });

  const date = new Date();
  const query = { Action: "SendSms", Version: "2020-01-01" };
  const headers: Record<string, string> = {
    "content-type": "application/json",
    host: host(),
    "x-date": date.toISOString().replace(/[:-]|\.\d{3}/g, ""),
  };
  headers.authorization = volcSign({
    method: "POST",
    path: "/",
    query,
    headers,
    body,
    accessKey: accessKey(),
    secretKey: secretKey(),
    date,
  });

  const url = `https://${host()}/?${Object.entries(query).map(([k, v]) => `${k}=${v}`).join("&")}`;
  const timeoutMs = numberEnv("SMS_VOLC_TIMEOUT_MS", 10000);
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": headers["content-type"], authorization: headers.authorization, "x-date": headers["x-date"] },
      body,
      signal: controller.signal,
    });
    const raw = await res.json().catch(() => ({}));
    const err = (raw as any)?.ResponseMetadata?.Error;
    if (!res.ok || err) {
      return { ok: false, code: err?.Code ?? `HTTP_${res.status}`, raw };
    }
    const ids: unknown[] = (raw as any)?.Result?.MessageID ?? [];
    return { ok: true, messageId: Array.isArray(ids) && ids.length ? String(ids[0]) : undefined, raw };
  } catch (e) {
    return { ok: false, code: "NETWORK_ERROR", raw: e instanceof Error ? e.message : String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---- Provider ---------------------------------------------------------------

export const VolcengineProvider: SmsChannelProvider = {
  name: "volcengine",

  /** 文本短信：渲染后的整条正文作为 {1} 传入「内容透传模板」。 */
  async sendText(req: TextSmsReq): Promise<SendResult> {
    const missing = missingConfig();
    if (missing.length > 0) return { ok: false, code: "CONFIG_MISSING", raw: { missingEnv: missing } };
    return callSendSms([req.mobile], {
      templateId: contentTemplateId(),
      templateParam: { 1: req.content },
      signName: req.signName,
    });
  },

  /** 视频短信：火山需独立模板（SMS_VOLC_MMS_TEMPLATE_ID），未配置则诚实降级。 */
  async sendMms(req: MmsReq): Promise<SendResult> {
    const tpl = env("SMS_VOLC_MMS_TEMPLATE_ID").trim();
    if (!tpl) {
      return { ok: false, code: "UNSUPPORTED", raw: { reason: "火山视频短信模板未配置（SMS_VOLC_MMS_TEMPLATE_ID）" } };
    }
    return callSendSms([req.mobile], { templateId: tpl, signName: req.signName });
  },

  /** 闪信：火山 SendSms 组不提供，诚实降级。 */
  async sendFlash(_req: FlashReq): Promise<SendResult> {
    return { ok: false, code: "UNSUPPORTED", raw: { reason: "火山短信通道不提供闪信能力" } };
  },

  /** 空号检测：火山 SendSms 组不提供，返回 unknown（不伪造归属地/运营商）。 */
  async checkNumbers(mobiles: string[]): Promise<CheckResult[]> {
    return mobiles.map((mobile) => ({ mobile, status: "unknown" as const }));
  },

  /** 回执主动查询：火山以回调为主，未配置查询接口时返回 unknown（回执走 /api/webhooks/delivery）。 */
  async queryStatus(extnos: string[]): Promise<DeliveryReport[]> {
    return extnos.map((extno) => ({ extno, status: "unknown" as const }));
  },

  /** 余额：不通过 SendSms 组暴露，返回未配置（不伪造假余额）。 */
  async balance() {
    return { ok: false, raw: { reason: "火山短信余额需登录控制台查看，未提供 API" } };
  },
};
