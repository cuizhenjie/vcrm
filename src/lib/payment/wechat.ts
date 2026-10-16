import crypto from "node:crypto";
import fs from "node:fs";
import type { PaymentProvider, CreateOrderInput, CreateOrderResult, VerifyResult } from "./types";

/**
 * 微信支付 V3 —— Native（扫码）下单 + 异步通知验签。
 *
 * 凭证（在微信商户平台获取，配到 env）：
 *   PAYMENT_WECHAT_APP_ID        公众号/小程序 AppID
 *   PAYMENT_WECHAT_MCH_ID        商户号
 *   PAYMENT_WECHAT_API_V3_KEY    V3 API 密钥（32 字符，用于解密回调证书/资源）
 *   PAYMENT_WECHAT_PRIVATE_KEY   商户 API 私钥（PEM 内容，含 BEGIN/END）
 *   PAYMENT_WECHAT_CERT_SERIAL   商户证书序列号
 *   PAYMENT_WECHAT_PLATFORM_CERT 平台公钥 PEM（用于验签回调；可定期从平台下载更新）
 *
 * 也支持文件路径（私钥/平台证书通常以 .pem 文件存放）：
 *   PAYMENT_WECHAT_PRIVATE_KEY_PATH   商户私钥 PEM 文件路径（优先于 PRIVATE_KEY 内联值）
 *   PAYMENT_WECHAT_PLATFORM_CERT_PATH 平台公钥 PEM 文件路径（优先于 PLATFORM_CERT 内联值）
 * 新版微信商户采用「微信支付公钥」模式（无平台证书）：
 *   PAYMENT_WECHAT_PLATFORM_PUBLIC_KEY 微信支付公钥 PEM 内容（与平台证书同用于验签回调）
 *
 * 流程：
 *   下单：POST /v3/pay/transactions/native，body 用商户私钥 RSA-SHA256 签名放 Authorization 头。
 *        返回 code_url，前端生成二维码即 payUrl。
 *   回调：微信 POST 到 notify_url，headers 含 Wechatpay-Signature（平台私钥签名），
 *        body 是 AES-256-GCM 加密的 resource，用 API_V3_KEY 解密取真实支付结果。
 *        验签用平台公钥校验 timestamp.nonce.rawBody 的签名。
 */

const APP_ID = () => process.env.PAYMENT_WECHAT_APP_ID?.trim();
const MCH_ID = () => process.env.PAYMENT_WECHAT_MCH_ID?.trim();
const API_V3_KEY = () => process.env.PAYMENT_WECHAT_API_V3_KEY?.trim();
const CERT_SERIAL = () => process.env.PAYMENT_WECHAT_CERT_SERIAL?.trim();

/** 读取 PEM 内容：优先文件路径（*_PATH），回落内联 env 值；都无则空串。 */
const readPem = (pathKey: string, inlineKey: string): string => {
  const p = process.env[pathKey]?.trim();
  if (p) {
    try {
      return fs.readFileSync(p, "utf8").trim();
    } catch {
      return ""; // 文件不存在 → 视为未配置（isConfigured 会因空值拒绝）
    }
  }
  return process.env[inlineKey]?.trim() ?? "";
};
const PRIVATE_KEY = () => readPem("PAYMENT_WECHAT_PRIVATE_KEY_PATH", "PAYMENT_WECHAT_PRIVATE_KEY");
const PLATFORM_CERT = () =>
  readPem("PAYMENT_WECHAT_PLATFORM_CERT_PATH", "PAYMENT_WECHAT_PLATFORM_CERT") ||
  readPem("", "PAYMENT_WECHAT_PLATFORM_PUBLIC_KEY"); // 新版「微信支付公钥」模式兼容

const API_BASE = "https://api.mch.weixin.qq.com";

/** 生成 V3 Authorization 头（商户私钥 RSA-SHA256 签名）。 */
function buildAuthHeader(method: string, url: string, body: string): string | null {
  const pk = PRIVATE_KEY();
  const serial = CERT_SERIAL();
  if (!pk || !serial) return null;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = `${method}\n${url}\n${timestamp}\n${nonce}\n${body}\n`;
  const sign = crypto.createSign("RSA-SHA256").update(message).sign(pk, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${MCH_ID()}",serial_no="${serial}",nonce_str="${nonce}",timestamp="${timestamp}",signature="${sign}"`;
}

export const WechatPayment: PaymentProvider = {
  name: "wechat",

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    if (!this.isConfigured()) return { ok: false, errorCode: "not_configured" };
    const path = "/v3/pay/transactions/native";
    const bodyObj = {
      appid: APP_ID(),
      mchid: MCH_ID(),
      description: input.subject.slice(0, 127),
      out_trade_no: input.outTradeNo,
      time_expire: new Date(Date.now() + 30 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      notify_url: input.notifyUrl,
      amount: { total: input.amountFen, currency: "CNY" },
    };
    const bodyStr = JSON.stringify(bodyObj);
    const auth = buildAuthHeader("POST", path, bodyStr);
    if (!auth) return { ok: false, errorCode: "sign_failed" };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: auth },
        body: bodyStr,
        signal: controller.signal,
      });
      const raw = await res.json().catch(() => ({}));
      if (res.ok && raw.code_url) {
        return { ok: true, payUrl: raw.code_url as string, raw };
      }
      return { ok: false, errorCode: raw.code ?? `HTTP_${res.status}`, raw };
    } catch (e) {
      return { ok: false, errorCode: "network_error", raw: { msg: e instanceof Error ? e.message : String(e) } };
    } finally {
      clearTimeout(timer);
    }
  },

  async verifyCallback(rawBody: string, headers: Record<string, string>): Promise<VerifyResult> {
    if (!this.isConfigured() || !PLATFORM_CERT()) return { ok: false, error: "not_configured" };
    try {
      // 1. 验签：用平台公钥校验 timestamp.nonce.rawBody 的 Wechatpay-Signature
      const timestamp = headers["wechatpay-timestamp"];
      const nonce = headers["wechatpay-nonce"];
      const signature = headers["wechatpay-signature"];
      if (!timestamp || !nonce || !signature) return { ok: false, error: "missing_signature_headers" };
      const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
      const platformCert = PLATFORM_CERT()!;
      const ok = crypto.createVerify("RSA-SHA256").update(message).verify(platformCert, signature, "base64");
      if (!ok) return { ok: false, error: "signature_mismatch" };

      // 2. 解密 resource（AES-256-GCM，密钥 = API_V3_KEY）
      const parsed = JSON.parse(rawBody);
      const resource = parsed.resource;
      if (!resource || !resource.ciphertext) return { ok: false, error: "no_resource" };
      const decrypted = aesGcmDecrypt(resource.ciphertext, resource.associated_data ?? "", resource.nonce);
      const payload = JSON.parse(decrypted);

      // 3. 标准化结果
      if (payload.trade_state !== "SUCCESS") {
        return { ok: true, payload: { outTradeNo: payload.out_trade_no, tradeNo: payload.transaction_id, status: "failed", raw: payload } };
      }
      return {
        ok: true,
        payload: {
          outTradeNo: payload.out_trade_no,
          tradeNo: payload.transaction_id,
          amountFen: payload.amount?.total,
          status: "paid",
          raw: payload,
        },
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },

  successResponse() {
    // V3 要求返回 JSON
    return JSON.stringify({ code: "SUCCESS", message: "成功" });
  },

  isConfigured() {
    return !!(APP_ID() && MCH_ID() && API_V3_KEY() && PRIVATE_KEY() && CERT_SERIAL());
  },
};

/** AES-256-GCM 解密（微信 V3 回调 resource 用 API_V3_KEY 解密）。 */
function aesGcmDecrypt(ciphertextB64: string, associatedData: string, nonce: string): string {
  const key = Buffer.from(API_V3_KEY()!, "utf-8");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const authTag = ciphertext.subarray(ciphertext.length - 16);
  const encrypted = ciphertext.subarray(0, ciphertext.length - 16);
  // 微信回调 nonce 为 base64 编码的 12 字节随机数，需 base64 解码后作为 GCM IV（官方文档格式）
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64"));
  decipher.setAuthTag(authTag);
  if (associatedData) decipher.setAAD(Buffer.from(associatedData, "utf-8"));
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf-8");
}
