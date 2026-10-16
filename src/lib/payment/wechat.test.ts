import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";
import { WechatPayment } from "./wechat";

/**
 * 微信支付 V3 签名/验签/解密闭环测试（无需真实商户凭证）。
 * 用 Node 临时生成 RSA 密钥对模拟「商户私钥 + 平台公钥」：
 *  - buildAuthHeader 依赖 PRIVATE_KEY/CERT_SERIAL → 生成可解析的 WECHATPAY2 头
 *  - verifyCallback 依赖 PLATFORM_CERT 验签 + API_V3_KEY 解密 AES-256-GCM 资源
 */
describe("微信支付 V3", () => {
  let merchantPriv: string;
  let platformPriv: string;
  let platformPub: string;
  const ORIG = {
    appId: process.env.PAYMENT_WECHAT_APP_ID,
    mchId: process.env.PAYMENT_WECHAT_MCH_ID,
    apiV3Key: process.env.PAYMENT_WECHAT_API_V3_KEY,
    privKey: process.env.PAYMENT_WECHAT_PRIVATE_KEY,
    serial: process.env.PAYMENT_WECHAT_CERT_SERIAL,
    platCert: process.env.PAYMENT_WECHAT_PLATFORM_CERT,
  };

  beforeAll(() => {
    const merchant = crypto.generateKeyPairSync("rsa", {
      modulusLength: 3072,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    const platform = crypto.generateKeyPairSync("rsa", {
      modulusLength: 3072,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    merchantPriv = merchant.privateKey;
    platformPriv = platform.privateKey;
    platformPub = platform.publicKey;

    process.env.PAYMENT_WECHAT_APP_ID = "wx-test-appid";
    process.env.PAYMENT_WECHAT_MCH_ID = "1900000109";
    process.env.PAYMENT_WECHAT_API_V3_KEY = "0123456789abcdef0123456789abcdef"; // 32 字节
    process.env.PAYMENT_WECHAT_PRIVATE_KEY = merchantPriv;
    process.env.PAYMENT_WECHAT_CERT_SERIAL = "ABCDEF1234567890";
    process.env.PAYMENT_WECHAT_PLATFORM_CERT = platformPub;
  });

  afterAll(() => {
    process.env.PAYMENT_WECHAT_APP_ID = ORIG.appId;
    process.env.PAYMENT_WECHAT_MCH_ID = ORIG.mchId;
    process.env.PAYMENT_WECHAT_API_V3_KEY = ORIG.apiV3Key;
    process.env.PAYMENT_WECHAT_PRIVATE_KEY = ORIG.privKey;
    process.env.PAYMENT_WECHAT_CERT_SERIAL = ORIG.serial;
    process.env.PAYMENT_WECHAT_PLATFORM_CERT = ORIG.platCert;
  });

  it("isConfigured 在凭证齐全时返回 true", () => {
    expect(WechatPayment.isConfigured()).toBe(true);
  });

  it("verifyCallback 校验平台签名并解密 AES-256-GCM 资源 → paid", async () => {
    const apiV3Key = process.env.PAYMENT_WECHAT_API_V3_KEY!;
    const timestamp = Math.floor(Date.now() / 1000).toString();
    // 微信回调 nonce 为 12 字节字符串，同时作为 GCM IV（与 aesGcmDecrypt 的 utf-8 IV 一致）
    const nonce = Buffer.from("abcdefghijkl").toString("base64");

    // 构造真实回调：明文 → AES-256-GCM 加密，ciphertext = 密文 + 16 字节 auth tag（微信格式）
    const plaintext = JSON.stringify({
      out_trade_no: "WX_order_1",
      transaction_id: "4200001234",
      trade_state: "SUCCESS",
      amount: { total: 500, currency: "CNY" },
    });
    const iv = Buffer.from("abcdefghijkl", "utf-8"); // 与 nonce 同源（微信用 nonce 作 IV）
    const cipher = crypto.createCipheriv("aes-256-gcm", Buffer.from(apiV3Key, "utf8"), iv);
    cipher.setAAD(Buffer.from("transaction", "utf8"));
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const resource = {
      original_type: "transaction",
      algorithm: "AEAD_AES_256_GCM",
      ciphertext: Buffer.concat([encrypted, authTag]).toString("base64"), // 密文+tag
      associated_data: "transaction",
      nonce: iv.toString("base64"),
    };
    const rawBody = JSON.stringify({ resource });

    // 平台用私钥对 timestamp\nnonce\nbody 签名
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
      .sign(platformPriv, "base64");

    const res = await WechatPayment.verifyCallback(rawBody, {
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": nonce,
      "wechatpay-signature": signature,
    });

    expect(res.ok).toBe(true);
    expect(res.payload?.outTradeNo).toBe("WX_order_1");
    expect(res.payload?.tradeNo).toBe("4200001234");
    expect(res.payload?.amountFen).toBe(500);
    expect(res.payload?.status).toBe("paid");
  });

  it("verifyCallback 平台签名错误 → signature_mismatch", async () => {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const nonce = "badnonce123";
    const rawBody = JSON.stringify({ resource: { ciphertext: "x" } });
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(`${timestamp}\n${nonce}\n${rawBody}\n`)
      .sign(platformPriv, "base64");
    const res = await WechatPayment.verifyCallback(rawBody, {
      "wechatpay-timestamp": timestamp,
      "wechatpay-nonce": nonce,
      "wechatpay-signature": "invalid",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("signature_mismatch");
  });

  it("createOrder 缺少签名头 → sign_failed（凭证部分缺失时优雅降级）", async () => {
    const origPriv = process.env.PAYMENT_WECHAT_PRIVATE_KEY;
    process.env.PAYMENT_WECHAT_PRIVATE_KEY = "";
    const res = await WechatPayment.createOrder({
      outTradeNo: "WX_order_2",
      amountFen: 500,
      subject: "测试",
      notifyUrl: "http://localhost/api/payment/callback/wechat",
    });
    process.env.PAYMENT_WECHAT_PRIVATE_KEY = origPriv;
    expect(res.ok).toBe(false);
    expect(res.errorCode).toBe("not_configured");
  });
});
