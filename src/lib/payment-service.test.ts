import { describe, it, expect } from "vitest";
import { MockPayment } from "./payment/mock";

describe("Mock 支付渠道", () => {
  it("createOrder 返回带 out 的 payUrl", async () => {
    const res = await MockPayment.createOrder({
      outTradeNo: "order_123",
      amountFen: 500,
      subject: "测试充值",
      notifyUrl: "http://localhost:3000/api/payment/callback/mock",
    });
    expect(res.ok).toBe(true);
    expect(res.payUrl).toContain("out=order_123");
  });

  it("createOrder 在 payUrl 中携带 amountFen（供支付页回传做金额校验）", async () => {
    const res = await MockPayment.createOrder({
      outTradeNo: "order_amt",
      amountFen: 9900,
      subject: "套餐",
      notifyUrl: "http://localhost:3000/api/payment/callback/mock",
    });
    expect(res.payUrl).toContain("amount=9900");
  });

  it("verifyCallback 解析出 paid 状态与 outTradeNo", async () => {
    const body = JSON.stringify({ outTradeNo: "order_456", amountFen: 1000 });
    const res = await MockPayment.verifyCallback(body, {});
    expect(res.ok).toBe(true);
    expect(res.payload?.outTradeNo).toBe("order_456");
    expect(res.payload?.status).toBe("paid");
    expect(res.payload?.amountFen).toBe(1000);
  });

  it("verifyCallback 未传金额时 amountFen 为 undefined（服务端会因金额不匹配拒绝，闭环完整）", async () => {
    const res = await MockPayment.verifyCallback(JSON.stringify({ outTradeNo: "order_999" }), {});
    expect(res.ok).toBe(true);
    expect(res.payload?.amountFen).toBeUndefined();
  });

  it("verifyCallback 缺少 outTradeNo 返回失败", async () => {
    const res = await MockPayment.verifyCallback("{}", {});
    expect(res.ok).toBe(false);
  });

  it("isConfigured 恒为 true", () => {
    expect(MockPayment.isConfigured()).toBe(true);
  });

  it("successResponse 返回 JSON", () => {
    expect(MockPayment.successResponse()).toContain("OK");
  });
});
