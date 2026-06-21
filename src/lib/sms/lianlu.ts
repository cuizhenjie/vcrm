import crypto from "node:crypto";
import type { SmsChannelProvider, TextSmsReq, MmsReq, FlashReq, CheckResult, SendResult, DeliveryReport } from "./types";

/**
 * 联麓通道实现（生产形态骨架）。
 * ⚠ 端点路径 / 签名算法 / 成功判定字段 / 回执字段 均以登录后控制台 api_4_2 文档为准，
 *   已抽成环境变量，对接时改 .env 即可，无需改代码。
 */
const env = (k: string, d = "") => process.env[k] ?? d;
const base = () => env("LIANLU_BASE_URL", "https://api.shlianlu.com");
const account = () => env("LIANLU_ACCOUNT");
const apiKey = () => env("LIANLU_API_KEY");
const sign = () => env("LIANLU_SIGN");

// 签名：默认 算法(account + apiKey + timestamp)，算法可配 md5/sha1/sha256 ⚠以文档为准
function makeSign(ts: string): string {
  const algo = env("LIANLU_SIGN_ALGO", "md5");
  return crypto.createHash(algo).update(account() + apiKey() + ts).digest("hex");
}

async function call(path: string, params: Record<string, string>, retries = 2): Promise<{ ok: boolean; code?: string; raw: any }> {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = new URLSearchParams({ account: account(), timestamp: ts, sign: makeSign(ts), ...params });
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(base() + path, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      const raw = await res.json().catch(() => ({}));
      const field = env("LIANLU_SUCCESS_FIELD", "code");
      const okVal = env("LIANLU_SUCCESS_VALUE", "0");
      const ok = String(raw?.[field]) === okVal || raw?.status === "success";
      return { ok, code: raw?.[field], raw };
    } catch (e) {
      if (attempt === retries) return { ok: false, code: "NETWORK_ERROR", raw: String(e) };
      await new Promise((r) => setTimeout(r, 300 * (attempt + 1))); // 退避重试
    }
  }
  return { ok: false, code: "UNKNOWN", raw: null };
}

export const LianluProvider: SmsChannelProvider = {
  name: "lianlu",
  async sendText(req: TextSmsReq): Promise<SendResult> {
    const r = await call(env("LIANLU_SEND_PATH", "/sms/send"), { mobile: req.mobile, content: sign() + req.content, extno: req.extno ?? "" });
    return { ok: r.ok, messageId: r.raw?.msgId, code: r.code, raw: r.raw };
  },
  async sendMms(req: MmsReq): Promise<SendResult> {
    const r = await call(env("LIANLU_MMS_PATH", "/mms/send"), { mobile: req.mobile, templateId: req.templateId, extno: req.extno ?? "" });
    return { ok: r.ok, messageId: r.raw?.msgId, code: r.code, raw: r.raw };
  },
  async sendFlash(req: FlashReq): Promise<SendResult> {
    const r = await call(env("LIANLU_FLASH_PATH", "/flash/send"), { mobile: req.mobile, content: sign() + req.content, extno: req.extno ?? "" });
    return { ok: r.ok, messageId: r.raw?.msgId, code: r.code, raw: r.raw };
  },
  async checkNumbers(mobiles: string[]): Promise<CheckResult[]> {
    const r = await call(env("LIANLU_CHECK_PATH", "/empty/check"), { mobiles: mobiles.join(",") });
    const list = r.raw?.data ?? [];
    return mobiles.map((mobile) => {
      const hit = list.find?.((x: any) => x.mobile === mobile);
      return { mobile, status: hit?.status === "1" ? "active" : hit?.status === "0" ? "empty" : "unknown", province: hit?.province, carrier: hit?.carrier };
    });
  },
  async queryStatus(extnos: string[]): Promise<DeliveryReport[]> {
    const r = await call(env("LIANLU_QUERY_PATH", "/sms/query"), { extnos: extnos.join(",") });
    const list = r.raw?.data ?? [];
    return (list as any[]).map((x) => ({ extno: x.extno, status: x.status === "DELIVRD" ? "delivered" : x.status ? "undelivered" : "unknown" }));
  },
  async balance() {
    const r = await call(env("LIANLU_BALANCE_PATH", "/account/balance"), {});
    return { ok: r.ok, balance: Number(r.raw?.balance ?? 0), raw: r.raw };
  },
};
