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
 * 联麓（shlianlu）短信通道 —— 按官方 Signature 文档实现。
 *
 * 签名算法（所有接口通用，已按文档确认）：
 *   1. 请求参数名按 ASCII 字典序排序（Java Map.Entry.comparingByKey 等价，禁用 localeCompare）
 *   2. 过滤排除集字段 + 值为空的字段
 *   3. 拼成 `AppId=..&MchId=..&..&key=<apiKey>`
 *   4. MD5 → hex 转大写
 *
 * 请求格式（已按文档确认）：
 *   - POST application/json 到 https://apis.shlianlu.com<sms/product/...>
 *   - 公共参数：AppId / MchId / SignName / SignType=MD5 / TimeStamp(秒) / Type / Version
 *   - SignName 是独立字段；SessionContext 只放短信正文，不再前拼签名
 *   - apiKey 仅追加到待签名字符串末尾的 key=，不作为请求参数发送
 *
 * ⚠ 仍需联麓「发送 API 文档」或联调确认（已抽成 .env 可配，无需改码）：
 *   - 普通短信真实发送路径（默认占位 /sms/product/sendSMS）
 *   - 成功响应结构（默认按 code === LIANLU_SUCCESS_VALUE 判定）
 *   - 消息/流水号字段名（默认 LIANLU_MESSAGE_ID_FIELD 为空 → 不提取）
 */

type ParamValue = string | number | boolean | readonly string[] | null | undefined;
type Params = Record<string, ParamValue>;
type CallResult = { ok: boolean; code?: string; raw: unknown };
type CallOptions = { retries?: number };
type HttpResponse = { httpOk: boolean; status: number; raw: unknown };

/** 签名时必须排除的字段（复杂类型 + Signature 本身），来自官方文档 1.2。 */
const SIGNATURE_EXCLUDED_KEYS: ReadonlySet<string> = new Set([
  "PhoneNumberSet",
  "SessionContext",
  "SessionContextSet",
  "ContextParamSet",
  "TemplateParamSet",
  "Signature",
  "PhoneList",
  "phoneSet",
]);

const env = (k: string, d = ""): string => process.env[k] ?? d;

const numberEnv = (k: string, fallback: number): number => {
  const v = env(k);
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const base = (): string => env("LIANLU_BASE_URL", "https://apis.shlianlu.com").replace(/\/+$/, "");
const mchId = (): string => env("LIANLU_MCH_ID");
const appId = (): string => env("LIANLU_APP_ID");
const apiKey = (): string => env("LIANLU_API_KEY");
const signName = (): string => env("LIANLU_SIGN_NAME");

// ---- 签名 -----------------------------------------------------------------

const isEmptyValue = (v: ParamValue): boolean => {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false; // number / boolean 视为非空
};

/**
 * 生成签名。签名参数集 = compact 后的请求体再剔除排除集字段；
 * 调用方必须保证「参与签名的字段」与「实际发送的字段」除排除集外完全一致。
 */
const makeSignature = (params: Params, key: string): string => {
  const signingString = [
    ...Object.entries(params)
      .filter(([name, v]) => !SIGNATURE_EXCLUDED_KEYS.has(name) && !isEmptyValue(v))
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([name, v]) => {
        if (Array.isArray(v)) throw new Error(`签名遇到数组参数（应加入排除集）: ${name}`);
        return `${name}=${v}`;
      }),
    `key=${key}`,
  ].join("&");
  return crypto.createHash("md5").update(signingString, "utf8").digest("hex").toUpperCase();
};

// ---- 请求体组装 -----------------------------------------------------------

/** 组装请求体：公共参数 + 业务参数 → compact（去空值）→ 算签名 → 追加 Signature。 */
const buildRequestBody = (bizParams: Params): Params => {
  const merged: Params = {
    AppId: appId(),
    MchId: mchId(),
    SignName: signName(),
    SignType: "MD5",
    TimeStamp: String(Math.floor(Date.now() / 1000)),
    Type: env("LIANLU_MESSAGE_TYPE", "1"),
    Version: env("LIANLU_VERSION", "1.2.0"),
    ...bizParams,
  };
  // ⚠ compact 过滤逻辑必须与签名一致：先去空值，再对 compact 结果算签名，
  //    保证「发送字段集」与「签名字段集（去排除集）」完全对齐，服务端验签才通过。
  const compacted = compactParams(merged);
  return { ...compacted, Signature: makeSignature(compacted, apiKey()) };
};

const compactParams = (params: Params): Params => {
  const out: Params = {};
  for (const [k, v] of Object.entries(params)) {
    if (!isEmptyValue(v)) out[k] = v;
  }
  return out;
};

// ---- HTTP -----------------------------------------------------------------

const postJson = async (url: string, body: Params): Promise<HttpResponse> => {
  const timeoutMs = numberEnv("LIANLU_TIMEOUT_MS", 10000);
  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return { httpOk: res.ok, status: res.status, raw: parseJson(await res.text()) };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const call = async (
  path: string,
  bizParams: Params,
  options: CallOptions = {},
): Promise<CallResult> => {
  const missing = missingConfig();
  if (missing.length > 0) return { ok: false, code: "CONFIG_MISSING", raw: { missingEnv: missing } };

  const normalized = normalizePath(path);
  if (!normalized) return { ok: false, code: "UNCONFIGURED_ENDPOINT", raw: { path } };

  const maxRetries = options.retries ?? numberEnv("LIANLU_RETRIES", 0);
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      const res = await postJson(`${base()}${normalized}`, buildRequestBody(bizParams));
      return interpretResponse(res);
    } catch (error) {
      if (attempt === maxRetries) return { ok: false, code: "NETWORK_ERROR", raw: toMessage(error) };
      await delay(300 * (attempt + 1)); // 指数退避
    }
  }
  return { ok: false, code: "UNKNOWN", raw: null };
};

const interpretResponse = (res: HttpResponse): CallResult => {
  const field = env("LIANLU_SUCCESS_FIELD", "code").trim();
  const okValue = env("LIANLU_SUCCESS_VALUE", "0");
  if (!field) return { ok: false, code: "UNCONFIGURED_SUCCESS", raw: res.raw };
  const code = stringAt(res.raw, field);
  // HTTP 非 2xx 直接判失败（code 回落 HTTP 状态），避免网关错误页 body 凑巧命中成功值而误判
  if (!res.httpOk) return { ok: false, code: code ?? `HTTP_${res.status}`, raw: res.raw };
  return { ok: code === okValue, code, raw: res.raw };
};

// ---- 辅助 -----------------------------------------------------------------

const missingConfig = (): string[] =>
  (
    [
      ["LIANLU_BASE_URL", base()],
      ["LIANLU_MCH_ID", mchId()],
      ["LIANLU_APP_ID", appId()],
      ["LIANLU_API_KEY", apiKey()],
      ["LIANLU_SIGN_NAME", signName()],
    ] as Array<[string, string]>
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);

const normalizePath = (path: string): string => {
  const trimmed = (path ?? "").trim();
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
};

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const toMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const parseJson = (text: string): unknown => {
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { rawText: text };
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** 按点号路径取值，如 "data.balance" / "Response.Code"。 */
const valueAt = (raw: unknown, path: string): unknown =>
  path
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), raw);

const stringAt = (raw: unknown, path: string): string | undefined => {
  const v = valueAt(raw, path);
  return v === undefined || v === null ? undefined : String(v);
};

const toSendResult = (r: CallResult): SendResult => ({
  ok: r.ok,
  code: r.code,
  messageId: pickMessageId(r.raw),
  raw: r.raw,
});

const pickMessageId = (raw: unknown): string | undefined => {
  const field = env("LIANLU_MESSAGE_ID_FIELD").trim();
  return field ? stringAt(raw, field) : undefined;
};

const invalid = (code: string, reason: string): SendResult => ({ ok: false, code, raw: { reason } });

const unsupported = (feature: string): SendResult => ({
  ok: false,
  code: "UNSUPPORTED",
  raw: { feature, reason: "联麓该接口路径未配置（见 .env LIANLU_*_PATH）" },
});

const normalizeCheckStatus = (v: unknown): CheckResult["status"] => {
  const s = String(v ?? "").toLowerCase();
  if (["1", "active", "normal", "valid"].includes(s)) return "active";
  if (["0", "empty", "inactive", "invalid"].includes(s)) return "empty";
  return "unknown";
};

const normalizeDeliveryStatus = (v: unknown): DeliveryReport["status"] => {
  const s = String(v ?? "").toUpperCase();
  if (s === "DELIVRD" || s === "DELIVERED") return "delivered";
  return s ? "undelivered" : "unknown";
};

// ---- Provider -------------------------------------------------------------

export const LianluProvider: SmsChannelProvider = {
  name: "lianlu",

  async sendText(req: TextSmsReq): Promise<SendResult> {
    const mobile = req.mobile?.trim();
    const content = req.content?.trim();
    if (!mobile) return invalid("INVALID_MOBILE", "mobile 不能为空");
    if (!content) return invalid("INVALID_CONTENT", "content 不能为空");
    // 发送不重试：短信幂等性差，网络超时后实际可能已发送，重试会造成重复扣费/重复触达。
    const r = await call(
      env("LIANLU_SEND_PATH", "/sms/product/sendSMS"),
      { PhoneNumberSet: [mobile], SessionContext: content, Tag: req.extno?.trim() || "" },
      { retries: 0 },
    );
    return toSendResult(r);
  },

  async sendMms(req: MmsReq): Promise<SendResult> {
    const mobile = req.mobile?.trim();
    const templateId = req.templateId?.trim();
    if (!mobile) return invalid("INVALID_MOBILE", "mobile 不能为空");
    if (!templateId) return invalid("INVALID_TEMPLATE", "templateId 不能为空");
    const path = env("LIANLU_MMS_PATH");
    if (!path) return unsupported("sendMms");
    const r = await call(
      path,
      { PhoneNumberSet: [mobile], TemplateId: templateId, Tag: req.extno?.trim() || "" },
      { retries: 0 },
    );
    return toSendResult(r);
  },

  async sendFlash(req: FlashReq): Promise<SendResult> {
    const mobile = req.mobile?.trim();
    const content = req.content?.trim();
    if (!mobile) return invalid("INVALID_MOBILE", "mobile 不能为空");
    if (!content) return invalid("INVALID_CONTENT", "content 不能为空");
    const path = env("LIANLU_FLASH_PATH");
    if (!path) return unsupported("sendFlash");
    const r = await call(
      path,
      { PhoneNumberSet: [mobile], SessionContext: content, Tag: req.extno?.trim() || "" },
      { retries: 0 },
    );
    return toSendResult(r);
  },

  async checkNumbers(mobiles: string[]): Promise<CheckResult[]> {
    if (mobiles.length === 0) return [];
    const path = env("LIANLU_CHECK_PATH");
    if (!path) return mobiles.map((mobile) => ({ mobile, status: "unknown" }));
    const r = await call(path, { PhoneList: mobiles }, { retries: numberEnv("LIANLU_QUERY_RETRIES", 2) });
    const list = valueAt(r.raw, env("LIANLU_CHECK_LIST_FIELD", "data"));
    if (!Array.isArray(list)) return mobiles.map((mobile) => ({ mobile, status: "unknown" }));
    return mobiles.map((mobile) => {
      const hit = list.find(
        (item) => isRecord(item) && ["mobile", "Mobile", "PhoneNumber", "phone"].some((k) => String(item[k] ?? "") === mobile),
      );
      if (!isRecord(hit)) return { mobile, status: "unknown" as const };
      return {
        mobile,
        status: normalizeCheckStatus(hit.status ?? hit.Status),
        province: stringAt(hit, "province") ?? stringAt(hit, "Province"),
        carrier: stringAt(hit, "carrier") ?? stringAt(hit, "Carrier"),
      };
    });
  },

  async queryStatus(extnos: string[]): Promise<DeliveryReport[]> {
    if (extnos.length === 0) return [];
    const path = env("LIANLU_QUERY_PATH");
    if (!path) return extnos.map((extno) => ({ extno, status: "unknown" }));
    const r = await call(path, { Tag: extnos.join(",") }, { retries: numberEnv("LIANLU_QUERY_RETRIES", 2) });
    const list = valueAt(r.raw, env("LIANLU_QUERY_LIST_FIELD", "data"));
    if (!Array.isArray(list)) return extnos.map((extno) => ({ extno, status: "unknown" }));
    return list
      .filter(isRecord)
      .map((item) => ({
        extno: String(item.Tag ?? item.extno ?? item.ExtNo ?? ""),
        status: normalizeDeliveryStatus(item.status ?? item.Status),
      }))
      .filter((item) => item.extno);
  },

  async balance(): Promise<{ ok: boolean; balance?: number; raw: unknown }> {
    const r = await call(
      env("LIANLU_BALANCE_PATH", "/sms/product/balance"),
      {},
      { retries: numberEnv("LIANLU_QUERY_RETRIES", 2) },
    );
    const v = valueAt(r.raw, env("LIANLU_BALANCE_FIELD", "balance"));
    const n = v === undefined || v === null || v === "" ? undefined : Number(v);
    return { ok: r.ok, balance: n !== undefined && Number.isFinite(n) ? n : undefined, raw: r.raw };
  },
};
