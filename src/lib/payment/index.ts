import type { PaymentProvider } from "./types";
import { MockPayment } from "./mock";
import { WechatPayment } from "./wechat";
import { AlipayPayment } from "./alipay";

export type { PaymentProvider, CreateOrderInput, CreateOrderResult, CallbackPayload, VerifyResult } from "./types";

const REGISTRY: Record<string, PaymentProvider> = {
  mock: MockPayment,
  wechat: WechatPayment,
  alipay: AlipayPayment,
};

/**
 * 按 provider 名取支付渠道。
 * 安全约束：生产环境（NODE_ENV=production）禁止使用 mock 渠道（可凭空虚增额度）。
 * 默认渠道由 PAYMENT_PROVIDER 环境变量控制（默认 mock，仅 dev）。
 */
export function getPaymentProvider(name?: string): PaymentProvider {
  const n = (name ?? process.env.PAYMENT_PROVIDER ?? "mock").trim().toLowerCase();
  const isProd = process.env.NODE_ENV === "production";
  // 生产环境拒绝 mock：防任何人 POST 回调凭空加额度
  if (isProd && (n === "mock" || !REGISTRY[n])) {
    return {
      name: "mock",
      isConfigured: () => false,
      createOrder: async () => ({ ok: false, errorCode: "mock_disabled_in_production" }),
      verifyCallback: async () => ({ ok: false, error: "mock_disabled_in_production" }),
      successResponse: () => "mock disabled",
    };
  }
  return REGISTRY[n] ?? MockPayment;
}

/** 列出所有渠道及其就绪状态（给前端充值页选择用；生产环境隐藏 mock）。 */
export function listProviders() {
  const isProd = process.env.NODE_ENV === "production";
  return Object.values(REGISTRY)
    .filter((p) => !isProd || p.name !== "mock")
    .map((p) => ({
      name: p.name,
      configured: p.isConfigured(),
    }));
}
