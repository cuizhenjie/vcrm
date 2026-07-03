import type { PaymentProvider, CreateOrderInput, CreateOrderResult, VerifyResult } from "./types";

/**
 * 支付宝电脑网站支付脚手架。
 *
 * 接入步骤（拿到商户密钥后）：
 *   1. 配置 env: PAYMENT_ALIPAY_APP_ID / PAYMENT_ALIPAY_PRIVATE_KEY / PAYMENT_ALIPAY_PUBLIC_KEY
 *   2. 在 createOrder 内组装支付宝 alipay.trade.page.pay 请求参数并 RSA2 签名
 *   3. verifyCallback 内用支付宝公钥校验异步通知 sign
 *   4. 推荐用 alipay-sdk npm 包
 *
 * 当前：未配置凭证时返回 not_configured。
 */

const APP_ID = () => process.env.PAYMENT_ALIPAY_APP_ID?.trim();
const PRIVATE_KEY = () => process.env.PAYMENT_ALIPAY_PRIVATE_KEY?.trim();
const PUBLIC_KEY = () => process.env.PAYMENT_ALIPAY_PUBLIC_KEY?.trim();

export const AlipayPayment: PaymentProvider = {
  name: "alipay",

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!this.isConfigured()) return { ok: false, errorCode: "not_configured" };
    // TODO: 用 alipay-sdk 组装 alipay.trade.page.pay：
    //   out_trade_no, total_amount(元), subject, notify_url=input.notifyUrl
    // 生成签名后的网关 URL 作为 payUrl 返回
    return { ok: false, errorCode: "not_implemented", raw: { hint: "填充支付宝 alipay.trade.page.pay" } };
  },

  async verifyCallback(rawBody: string, _headers: Record<string, string>): Promise<VerifyResult> {
    if (!this.isConfigured()) return { ok: false, error: "not_configured" };
    // TODO: 从 form-urlencoded body 解析所有参数，用支付宝公钥校验 sign（RSA2）
    // 取 out_trade_no, trade_no, total_amount, trade_status=TRADE_SUCCESS
    return { ok: false, error: "not_implemented" };
  },

  successResponse() {
    return "success";
  },

  isConfigured() {
    return !!(APP_ID() && PRIVATE_KEY() && PUBLIC_KEY());
  },
};
