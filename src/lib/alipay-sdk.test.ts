import { describe, it, expect, beforeAll, afterAll } from "vitest";
import crypto from "node:crypto";

/**
 * 支付宝签名/验签闭环测试。
 * 用 Node 临时生成 RSA-3072 密钥对，模拟"应用私钥签名 + 支付宝公钥验签"。
 * alipaySign/alipayVerify 每次调用都读 env，故设置 env 后直接调用即可。
 */
describe("支付宝签名验签", () => {
  let privateKey: string;
  let publicKey: string;
  const ORIG_PRIV = process.env.PAYMENT_ALIPAY_PRIVATE_KEY;
  const ORIG_PUB = process.env.PAYMENT_ALIPAY_PUBLIC_KEY;

  beforeAll(() => {
    const { privateKey: priv, publicKey: pub } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 3072,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    privateKey = priv;
    publicKey = pub;
  });

  afterAll(() => {
    process.env.PAYMENT_ALIPAY_PRIVATE_KEY = ORIG_PRIV;
    process.env.PAYMENT_ALIPAY_PUBLIC_KEY = ORIG_PUB;
  });

  it("签名后能用对应公钥验签通过", async () => {
    process.env.PAYMENT_ALIPAY_PRIVATE_KEY = privateKey;
    process.env.PAYMENT_ALIPAY_PUBLIC_KEY = publicKey;
    const { alipaySign, alipayVerify } = await import("./alipay-sdk");

    const params = {
      app_id: "20210000",
      out_trade_no: "ORDER123",
      trade_status: "TRADE_SUCCESS",
      total_amount: "5.00",
    };
    const sign = alipaySign(params);
    expect(sign).toBeTruthy();
    expect(alipayVerify(params, sign!)).toBe(true);
  });

  it("篡改参数后验签失败", async () => {
    process.env.PAYMENT_ALIPAY_PRIVATE_KEY = privateKey;
    process.env.PAYMENT_ALIPAY_PUBLIC_KEY = publicKey;
    const { alipaySign, alipayVerify } = await import("./alipay-sdk");

    const params = { out_trade_no: "ORDER1", total_amount: "5.00" };
    const sign = alipaySign(params);
    expect(sign).toBeTruthy();
    const tampered = { ...params, total_amount: "99999.00" };
    expect(alipayVerify(tampered, sign!)).toBe(false);
  });

  it("无密钥时签名返回 null", async () => {
    process.env.PAYMENT_ALIPAY_PRIVATE_KEY = "";
    const { alipaySign } = await import("./alipay-sdk");
    expect(alipaySign({ a: "1" })).toBeNull();
  });
});
