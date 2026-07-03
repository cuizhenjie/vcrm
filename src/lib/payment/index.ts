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
 * 按 provider 名取支付渠道。未知名回落 mock。
 * 默认渠道由 PAYMENT_PROVIDER 环境变量控制（默认 mock）。
 */
export function getPaymentProvider(name?: string): PaymentProvider {
  const n = (name ?? process.env.PAYMENT_PROVIDER ?? "mock").trim().toLowerCase();
  return REGISTRY[n] ?? MockPayment;
}

/** 列出所有渠道及其就绪状态（给前端充值页选择用）。 */
export function listProviders() {
  return Object.values(REGISTRY).map((p) => ({
    name: p.name,
    configured: p.isConfigured(),
  }));
}
