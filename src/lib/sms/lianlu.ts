import type { SmsChannelProvider, TextSmsReq, MmsReq, FlashReq, CheckResult, SendResult } from "./types";

/**
 * 联麓通道实现。
 * ⚠ 下列 路径 / 参数名 / 签名算法 / 返回字段 均需以登录后控制台
 *   `console/document/api_4_2`（国内通知短信）等真实文档为准，这里给的是占位骨架。
 */
const base = process.env.LIANLU_BASE_URL ?? "https://api.shlianlu.com";
const account = process.env.LIANLU_ACCOUNT ?? "";
const apiKey = process.env.LIANLU_API_KEY ?? "";
const sign = process.env.LIANLU_SIGN ?? "";

async function post(path: string, params: Record<string, string>): Promise<SendResult> {
  // 签名占位：真实算法（MD5/SHA + 时间戳）以控制台文档为准 ⚠
  const body = new URLSearchParams({ account, password: apiKey, ...params });
  try {
    const res = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const raw = await res.json().catch(() => ({}));
    // ⚠ 成功判定字段以文档为准，常见为 code === "0" 或 status === "success"
    const ok = (raw as any)?.code === "0" || (raw as any)?.status === "success";
    return { ok, messageId: (raw as any)?.msgId, code: (raw as any)?.code, raw };
  } catch (e) {
    return { ok: false, code: "NETWORK_ERROR", raw: String(e) };
  }
}

export const LianluProvider: SmsChannelProvider = {
  name: "lianlu",
  // ⚠ 发送路径占位，以 api_4_2 文档为准
  async sendText(req: TextSmsReq) {
    return post("/sms/send", { mobile: req.mobile, content: sign + req.content, extno: req.extno ?? "" });
  },
  async sendMms(req: MmsReq) {
    return post("/mms/send", { mobile: req.mobile, templateId: req.templateId, extno: req.extno ?? "" });
  },
  async sendFlash(req: FlashReq) {
    return post("/flash/send", { mobile: req.mobile, content: sign + req.content, extno: req.extno ?? "" });
  },
  async checkNumbers(mobiles: string[]): Promise<CheckResult[]> {
    // ⚠ 空号检测接口路径/字段以 emptyDoc 文档为准
    const r = await post("/empty/check", { mobiles: mobiles.join(",") });
    const list = (r.raw as any)?.data ?? [];
    return mobiles.map((mobile) => {
      const hit = list.find((x: any) => x.mobile === mobile);
      return { mobile, status: hit?.status === "1" ? "active" : hit?.status === "0" ? "empty" : "unknown", province: hit?.province, carrier: hit?.carrier };
    });
  },
};
