/**
 * 支付渠道抽象层。
 *
 * 设计：每个渠道实现 PaymentProvider 接口。
 * 创建订单 → 返回支付链接/二维码 → 用户支付 → 渠道异步回调 /payment/callback/{provider}
 * → 校验签名 → 标记订单 paid → 给租户加额度（CreditLedger）。
 *
 * 当前实现：
 *   - mock：本地开发，下单即返回 payUrl，回调直接成功（用于联调）
 *   - wechat：微信 Native 支付（扫码），待接商户密钥后填实现
 *   - alipay：支付宝电脑网站支付，待接商户密钥后填实现
 *
 * 接真实渠道时：在对应 provider 文件内填充 createOrder/verifyCallback 的真实逻辑，
 * 并配置 PAYMENT_WECHAT_* / PAYMENT_ALIPAY_* 环境变量。无需改动调用方。
 */

export interface CreateOrderInput {
  outTradeNo: string; // 商户订单号（业务侧唯一）
  amountFen: number; // 金额（分）
  subject: string; // 订单标题
  notifyUrl: string; // 异步回调地址
}

export interface CreateOrderResult {
  ok: boolean;
  payUrl?: string; // 支付链接/二维码内容
  raw?: unknown;
  errorCode?: string;
}

export interface CallbackPayload {
  outTradeNo: string; // 商户订单号
  tradeNo?: string; // 渠道交易号
  amountFen?: number; // 金额（分，用于校验）
  status: "paid" | "failed";
  raw: unknown;
}

export interface VerifyResult {
  ok: boolean;
  payload?: CallbackPayload;
  error?: string;
}

export interface PaymentProvider {
  name: "mock" | "wechat" | "alipay";
  /** 创建支付订单，返回支付链接。 */
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  /** 校验异步回调签名与内容，返回标准化结果。 */
  verifyCallback(rawBody: string, headers: Record<string, string>): Promise<VerifyResult>;
  /** 返回「收到」的同步响应内容（给渠道确认用）。 */
  successResponse(): string;
  /** 是否就绪（凭证配置完整）。 */
  isConfigured(): boolean;
}
