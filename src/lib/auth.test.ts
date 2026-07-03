import { describe, it, expect } from "vitest";
import { signSession, verifySession } from "./auth";

const SECRET = "a".repeat(64); // 64 字符测试密钥

describe("session token v2（携带身份）", () => {
  it("签发并校验 v2 token，解析出正确的身份信息", () => {
    const identity = { userId: "u1", tenantId: "tenant_a", role: "owner" };
    const token = signSession(SECRET, identity);
    expect(token.split(".")).toHaveLength(5);
    const parsed = verifySession(token, SECRET);
    expect(parsed).not.toBeNull();
    expect(parsed).toEqual(identity);
  });

  it("不同租户的 token 身份隔离", () => {
    const a = signSession(SECRET, { userId: "u1", tenantId: "tenant_a", role: "owner" });
    const b = signSession(SECRET, { userId: "u2", tenantId: "tenant_b", role: "sales" });
    expect(verifySession(a, SECRET)?.tenantId).toBe("tenant_a");
    expect(verifySession(b, SECRET)?.tenantId).toBe("tenant_b");
    expect(verifySession(b, SECRET)?.role).toBe("sales");
  });

  it("错误密钥校验失败返回 null", () => {
    const token = signSession(SECRET, { userId: "u1", tenantId: "t1", role: "owner" });
    expect(verifySession(token, "b".repeat(64))).toBeNull();
  });

  it("篡改 payload 后校验失败", () => {
    const token = signSession(SECRET, { userId: "u1", tenantId: "t1", role: "owner" });
    // 篡改 tenantId 段
    const parts = token.split(".");
    parts[2] = "tenant_evil";
    expect(verifySession(parts.join("."), SECRET)).toBeNull();
  });
});

describe("session token 旧格式已废弃（安全：防权限提升）", () => {
  it("未传 identity 时签发 fallback 身份的 v2 token（回落 default_tenant/owner）", () => {
    const token = signSession(SECRET);
    const parsed = verifySession(token, SECRET);
    expect(parsed).not.toBeNull();
    expect(parsed?.tenantId).toBe("default_tenant");
    expect(parsed?.role).toBe("owner");
  });

  it("旧格式 token（expiry.nonce.sig）已废弃，校验返回 null", () => {
    // 构造一个签名正确的旧格式 token，应被拒绝（防旧 token 越权拿 owner）
    const crypto = require("crypto");
    const expiry = Date.now() + 60000;
    const nonce = "abc12345";
    const payload = `${expiry}.${nonce}`;
    const sig = crypto.createHmac("sha256", SECRET).update(payload).digest("hex");
    const oldToken = `${payload}.${sig}`;
    expect(oldToken.split(".")).toHaveLength(3);
    expect(verifySession(oldToken, SECRET)).toBeNull();
  });
});

describe("verifySession 边界", () => {
  it("空 token / undefined 返回 null", () => {
    expect(verifySession(undefined, SECRET)).toBeNull();
    expect(verifySession("", SECRET)).toBeNull();
  });
  it("格式错误的 token 返回 null", () => {
    expect(verifySession("abc.def", SECRET)).toBeNull();
    expect(verifySession("a.b.c.d.e.f", SECRET)).toBeNull();
  });
});
