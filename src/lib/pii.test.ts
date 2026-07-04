import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { maskMobile, maskEmail, safeLog } from "./pii";
import { isAllowedRedirectHost } from "./redirect-guard";

describe("PII 脱敏", () => {
  it("maskMobile 11 位手机号保留前3后4", () => {
    expect(maskMobile("13812345678")).toBe("138****5678");
  });
  it("maskMobile 短号/非11位返回 ***", () => {
    expect(maskMobile("123")).toBe("***");
    expect(maskMobile("")).toBe("");
    expect(maskMobile(null)).toBe("");
  });
  it("maskEmail 保留首字符+@域名", () => {
    expect(maskEmail("alice@example.com")).toBe("a***@example.com");
    expect(maskEmail("b@test.com")).toBe("b***@test.com");
  });
  it("safeLog 对象中的 mobile/email/password 脱敏", () => {
    const out = safeLog({ mobile: "13900001111", email: "x@y.com", password: "secret123", name: "张三" });
    expect(out).toContain("139****1111");
    expect(out).toContain("x***@y.com");
    expect(out).toContain("***");
    expect(out).not.toContain("secret123");
    expect(out).toContain("张三");
  });
});

describe("短链重定向白名单 redirect-guard", () => {
  const ORIG = { ...process.env };

  beforeEach(() => {
    process.env = { ...ORIG };
  });
  afterEach(() => {
    process.env = ORIG;
  });

  it("未配白名单时仅允许 APP_BASE_URL 同 host", () => {
    process.env.APP_BASE_URL = "https://vcrm.example.com";
    delete process.env.REDIRECT_ALLOWED_HOSTS;
    expect(isAllowedRedirectHost("https://vcrm.example.com/landing")).toBe(true);
    expect(isAllowedRedirectHost("https://evil.com/")).toBe(false);
  });
  it("配置了 REDIRECT_ALLOWED_HOSTS 则允许白名单内", () => {
    process.env.APP_BASE_URL = "https://vcrm.example.com";
    process.env.REDIRECT_ALLOWED_HOSTS = "shop.com,landing.shop.com";
    expect(isAllowedRedirectHost("https://shop.com/x")).toBe(true);
    expect(isAllowedRedirectHost("https://landing.shop.com/x")).toBe(true);
    expect(isAllowedRedirectHost("https://other.com/x")).toBe(false);
  });
  it("禁止非 http(s) 协议", () => {
    process.env.APP_BASE_URL = "https://vcrm.example.com";
    expect(isAllowedRedirectHost("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectHost("data:text/html,evil")).toBe(false);
  });
  it("非法 URL 返回 false", () => {
    expect(isAllowedRedirectHost("not-a-url")).toBe(false);
  });
});
