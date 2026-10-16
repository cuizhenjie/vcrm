import type { PaymentProvider, CreateOrderInput, CreateOrderResult, VerifyResult } from "./types";

/**
 * Mock 支付渠道：本地开发用。
 * - createOrder 返回一个 payUrl，访问后直接成功（mock 回调）。
 * - verifyCallback 直接信任参数（无签名），仅限 dev。
 */
export const MockPayment: PaymentProvider = {
  name: "mock",

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    // mock：payUrl 指向本站 mock 支付完成页（前端跳转后调 callback）
    // 金额随 URL 传递（amountFen），支付页回传后由回调做金额校验，保证闭环完整
    const payUrl = `${process.env.APP_BASE_URL || "http://localhost:3000"}/pay/mock?out=${input.outTradeNo}&amount=${input.amountFen}`;
    return { ok: true, payUrl, raw: { mock: true } };
  },

  async verifyCallback(rawBody: string): Promise<VerifyResult> {
    try {
      const body = JSON.parse(rawBody || "{}");
      if (!body.outTradeNo) return { ok: false, error: "missing outTradeNo" };
      return {
        ok: true,
        payload: {
          outTradeNo: body.outTradeNo,
          tradeNo: body.tradeNo ?? `mock_${Date.now()}`,
          amountFen: Number(body.amountFen) || undefined,
          status: "paid",
          raw: body,
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  successResponse() {
    return JSON.stringify({ code: "OK", msg: "success" });
  },

  isConfigured() {
    return true;
  },
};
