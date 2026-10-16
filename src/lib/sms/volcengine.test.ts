import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { volcSign, VolcengineProvider } from "./volcengine";

/** 与 ym_pro 实测通过实现一致的签名向量：结构/确定性/密钥敏感性。 */
describe("volcengine V4 签名", () => {
  const base = {
    method: "POST",
    path: "/",
    query: { Action: "SendSms", Version: "2020-01-01" },
    headers: { "content-type": "application/json", host: "sms.volcengineapi.com", "x-date": "20260816T000000Z" },
    body: "{}",
    accessKey: "AKTEST",
    secretKey: "SKTEST",
    date: new Date("2026-08-16T00:00:00.000Z"),
  };

  it("生成结构化 HMAC-SHA256 Authorization 头", () => {
    const auth = volcSign(base);
    expect(auth).toMatch(
      /^HMAC-SHA256 Credential=AKTEST\/20260816\/cn-north-1\/volcSMS\/request, SignedHeaders=content-type;host;x-date, Signature=[0-9a-f]{64}$/,
    );
  });

  it("同一输入签名确定性一致", () => {
    expect(volcSign(base)).toBe(volcSign(base));
  });

  it("密钥不同则签名不同", () => {
    const other = volcSign({ ...base, secretKey: "SKOTHER" });
    expect(other).not.toBe(volcSign(base));
  });

  it("正文变化则签名变化（防篡改）", () => {
    const changed = volcSign({ ...base, body: '{"a":1}' });
    expect(changed).not.toBe(volcSign(base));
  });
});

/** 真实发送行为：配置缺失降级 / 请求体组装 / 响应解析。 */
describe("VolcengineProvider 发送", () => {
  const clean = () => {
    vi.unstubAllEnvs();
  };

  beforeEach(() => {
    clean();
    vi.stubEnv("SMS_VOLC_ACCESS_KEY", "AKTEST");
    vi.stubEnv("SMS_VOLC_SECRET_KEY", "SKTEST");
    vi.stubEnv("SMS_VOLC_SMS_ACCOUNT", "8c6bfe9f");
    vi.stubEnv("SMS_VOLC_TEMPLATE_ID", "ST_TEST");
    vi.stubEnv("SMS_VOLC_SIGN", "北京三酷科技");
  });
  afterEach(clean);

  it("凭证缺失时返回 CONFIG_MISSING 且不调用网络", async () => {
    vi.stubEnv("SMS_VOLC_ACCESS_KEY", "");
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await VolcengineProvider.sendText({ mobile: "13800138000", content: "hello" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("CONFIG_MISSING");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("sendText 组装火山协议请求体（逗号串/JSON 参数）并解析 MessageID", async () => {
    let sentUrl = "";
    let sentBody = "";
    const fetchMock = vi.fn(async (url: any, init: any) => {
      sentUrl = String(url);
      sentBody = String(init?.body ?? "");
      return new Response(
        JSON.stringify({ ResponseMetadata: { RequestId: "r1" }, Result: { MessageID: ["msg_123"] } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await VolcengineProvider.sendText({ mobile: "13800138000", content: "尊敬的客户您好" });
    expect(res.ok).toBe(true);
    expect(res.messageId).toBe("msg_123");

    // 请求 URL 走 SendSms / 2020-01-01
    expect(sentUrl).toContain("Action=SendSms");
    expect(sentUrl).toContain("Version=2020-01-01");
    // 请求体：SmsAccount / Sign / TemplateID / TemplateParam(JSON串) / PhoneNumbers(逗号串)
    const body = JSON.parse(sentBody);
    expect(body.SmsAccount).toBe("8c6bfe9f");
    expect(body.Sign).toBe("北京三酷科技");
    expect(body.TemplateID).toBe("ST_TEST");
    expect(body.PhoneNumbers).toBe("13800138000");
    expect(JSON.parse(body.TemplateParam)).toEqual({ 1: "尊敬的客户您好" });
    // 鉴权头已生成
    expect(fetchMock.mock.calls[0][1]?.headers?.authorization).toContain("HMAC-SHA256 Credential=AKTEST/");
  });

  it("签名透传：sendText 用请求级 signName 覆盖默认签名", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ ResponseMetadata: {}, Result: { MessageID: ["m"] } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    await VolcengineProvider.sendText({ mobile: "13800138000", content: "x", signName: "【自定义】" });
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body ?? "{}"));
    // 规范化：去掉【】，发送时用无括号签名
    expect(body.Sign).toBe("自定义");
  });

  it("火山返回 ResponseMetadata.Error 时判失败并透传错误码", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ ResponseMetadata: { Error: { Code: "InvalidTemplate", Message: "模板不存在" } } }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await VolcengineProvider.sendText({ mobile: "13800138000", content: "x" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("InvalidTemplate");
  });

  it("HTTP 非 2xx 判失败", async () => {
    const fetchMock = vi.fn(async () => new Response("bad gateway", { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await VolcengineProvider.sendText({ mobile: "13800138000", content: "x" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("HTTP_502");
  });

  it("sendMms 未配置模板时诚实降级 UNSUPPORTED", async () => {
    const res = await VolcengineProvider.sendMms({ mobile: "13800138000", templateId: "t" });
    expect(res.ok).toBe(false);
    expect(res.code).toBe("UNSUPPORTED");
  });

  it("sendFlash / checkNumbers / queryStatus 诚实降级（不伪造）", async () => {
    const flash = await VolcengineProvider.sendFlash({ mobile: "13800138000", content: "x" });
    expect(flash.code).toBe("UNSUPPORTED");

    const checks = await VolcengineProvider.checkNumbers(["13800138000"]);
    expect(checks[0].status).toBe("unknown");
    expect(checks[0].province).toBeUndefined();

    const reports = await VolcengineProvider.queryStatus(["ext1"]);
    expect(reports[0].status).toBe("unknown");
  });

  it("balance 不伪造假余额", async () => {
    const b = await VolcengineProvider.balance();
    expect(b.ok).toBe(false);
  });
});
