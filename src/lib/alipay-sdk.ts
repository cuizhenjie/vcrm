import crypto from "node:crypto";
import type { PaymentProvider, CreateOrderInput, CreateOrderResult, VerifyResult } from "./payment/types";

/**
 * 支付宝电脑网站支付（alipay.trade.page.pay）+ 异步通知验签。
 *
 * 凭证（在支付宝开放平台获取，配到 env）：
 *   PAYMENT_ALIPAY_APP_ID        应用 APPID
 *   PAYMENT_ALIPAY_PRIVATE_KEY   应用私钥（PEM 或纯 Base64，RSA2）
 *   PAYMENT_ALIPAY_PUBLIC_KEY    支付宝公钥（PEM 或纯 Base64，用于验签异步通知）
 *   PAYMENT_ALIPAY_GATEWAY       网关地址（默认 https://openapi.alipay.com/gateway.do）
 *
 * 流程：
 *   下单：组装 biz_content + 公共参数，用应用私钥 RSA2 签名，
 *        拼成 GET 网关 URL（page.pay 是前端跳转接口），作为 payUrl 返回。
 *   回调：支付宝 POST form-urlencoded 到 notify_url，所有参数参与验签，
 *        用支付宝公钥校验 sign（RSA2 over 排序后待签名字符串）。
 *        trade_status=TRADE_SUCCESS || TRADE_FINISHED 表示成功。
 */

const APP_ID = () => process.env.PAYMENT_ALIPAY_APP_ID?.trim();
const PRIVATE_KEY = () => process.env.PAYMENT_ALIPAY_PRIVATE_KEY?.trim();
const PUBLIC_KEY = () => process.env.PAYMENT_ALIPAY_PUBLIC_KEY?.trim();
const GATEWAY = () => process.env.PAYMENT_ALIPAY_GATEWAY?.trim() || "https://openapi.alipay.com/gateway.do";

/** 把可能裸 Base64 的密钥补成 PEM 格式。 */
function toPem(key: string, isPrivate: boolean): string {
  const t = key.trim();
  if (t.includes("BEGIN")) return t;
  const header = isPrivate ? "PRIVATE KEY" : "PUBLIC KEY";
  const body = t.replace(/\s+/g, "").replace(/(.{64})/g, "$1\n").trim();
  return `-----BEGIN ${header}-----\n${body}\n-----END ${header}-----`;
}

/** 支付宝签名：参数按字典序排序 → k=v&k=v → RSA-SHA256(base64)。 */
export function alipaySign(params: Record<string, string>): string | null {
  const pk = PRIVATE_KEY();
  if (!pk) return null;
  const sorted = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  return crypto.createSign("RSA-SHA256").update(sorted, "utf-8").sign(toPem(pk, true), "base64");
}

/** 支付宝验签：用支付宝公钥校验 sign。 */
export function alipayVerify(params: Record<string, string>, sign: string): boolean {
  const pub = PUBLIC_KEY();
  if (!pub || !sign) return false;
  const sorted = Object.keys(params)
    .filter((k) => k !== "sign" && k !== "sign_type" && params[k] !== "" && params[k] !== undefined)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  try {
    return crypto.createVerify("RSA-SHA256").update(sorted, "utf-8").verify(toPem(pub, false), sign, "base64");
  } catch {
    return false;
  }
}

export const AlipayPayment: PaymentProvider = {
  name: "alipay",

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!this.isConfigured()) return { ok: false, errorCode: "not_configured" };
    const bizContent = JSON.stringify({
      out_trade_no: input.outTradeNo,
      total_amount: (input.amountFen / 100).toFixed(2),
      subject: input.subject.slice(0, 256),
      product_code: "FAST_INSTANT_TRADE_PAY",
    });
    const params: Record<string, string> = {
      app_id: APP_ID()!,
      method: "alipay.trade.page.pay",
      charset: "utf-8",
      sign_type: "RSA2",
      timestamp: formatAlipayTime(new Date()),
      version: "1.0",
      biz_content: bizContent,
      notify_url: input.notifyUrl,
    };
    const sign = alipaySign(params);
    if (!sign) return { ok: false, errorCode: "sign_failed" };
    params.sign = sign;
    // page.pay 是前端跳转：拼 GET URL 作为 payUrl
    const qs = new URLSearchParams(params).toString();
    return { ok: true, payUrl: `${GATEWAY()}?${qs}`, raw: params };
  },

  async verifyCallback(rawBody: string): Promise<VerifyResult> {
    if (!this.isConfigured()) return { ok: false, error: "not_configured" };
    try {
      // 支付宝异步通知是 form-urlencoded，用 URLSearchParams 解析（正确处理含 = 的值，如 base64 sign 末尾的 ==）
      const params: Record<string, string> = Object.fromEntries(new URLSearchParams(rawBody));
      const sign = params.sign;
      if (!sign) return { ok: false, error: "no_sign" };
      const ok = alipayVerify(params, sign);
      if (!ok) return { ok: false, error: "signature_mismatch" };

      const tradeStatus = params.trade_status;
      if (tradeStatus !== "TRADE_SUCCESS" && tradeStatus !== "TRADE_FINISHED") {
        return { ok: true, payload: { outTradeNo: params.out_trade_no, status: "failed", raw: params } };
      }
      const amountFen = params.total_amount ? Math.round(Number(params.total_amount) * 100) : undefined;
      return {
        ok: true,
        payload: {
          outTradeNo: params.out_trade_no,
          tradeNo: params.trade_no,
          amountFen: Number.isFinite(amountFen) ? amountFen : undefined,
          status: "paid",
          raw: params,
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  successResponse() {
    return "success";
  },

  isConfigured() {
    return !!(APP_ID() && PRIVATE_KEY() && PUBLIC_KEY());
  },
};

/** 支付宝时间格式 yyyy-MM-dd HH:mm:ss */
function formatAlipayTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
