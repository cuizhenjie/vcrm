import type { PaymentProvider, CreateOrderInput, CreateOrderResult, VerifyResult } from "./types";

/**
 * 微信 Native 支付（扫码）脚手架。
 *
 * 接入步骤（拿到商户号后）：
 *   1. 配置 env: PAYMENT_WECHAT_APP_ID / PAYMENT_WECHAT_MCH_ID / PAYMENT_WECHAT_API_KEY
 *   2. 在 createOrder 内调用微信「统一下单」API（https://api.mch.weixin.qq.com/pay/unifiedorder）
 *      签名方式按 V3 用 RSA 或 V2 用 MD5（取决于商户号类型）
 *   3. verifyCallback 内校验 V3 签名（WECHATPAY2-SHA256-RSA2048）或 V2 MD5
 *   4. 推荐直接用 wechatpay-node-v3 SDK，此处保留手写填充位
 *
 * 当前：未配置凭证时返回 not_configured，不影响 mock 渠道联调。
 */

const APP_ID = () => process.env.PAYMENT_WECHAT_APP_ID?.trim();
const MCH_ID = () => process.env.PAYMENT_WECHAT_MCH_ID?.trim();
const API_KEY = () => process.env.PAYMENT_WECHAT_API_KEY?.trim();

export const WechatPayment: PaymentProvider = {
  name: "wechat",

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!this.isConfigured()) return { ok: false, errorCode: "not_configured" };
    // TODO: 接入微信统一下单 API，组装如下参数并签名后 POST
    //   appid, mch_id, nonce_str, body=input.subject, out_trade_no=input.outTradeNo,
    //   total_fee=input.amountFen, notify_url=input.notifyUrl, trade_type=NATIVE
    // 解析返回的 code_url → 生成二维码 → 作为 payUrl 返回
    return { ok: false, errorCode: "not_implemented", raw: { hint: "填充微信统一下单 API 调用" } };
  },

  async verifyCallback(rawBody: string, headers: Record<string, string>): Promise<VerifyResult> {
    if (!this.isConfigured()) return { ok: false, error: "not_configured" };
    // TODO: 校验 Wechatpay-Signature 头（RSA-SHA256 over rawBody + timestamp + nonce + serial）
    // 解析 XML/JSON 取 out_trade_no, transaction_id, total_fee, result_code
    return { ok: false, error: "not_implemented" };
  },

  successResponse() {
    // 微信要求返回 XML
    return '<xml><return_code><![CDATA[SUCCESS]]></return_code></xml>';
  },

  isConfigured() {
    return !!(APP_ID() && MCH_ID() && API_KEY());
  },
};
