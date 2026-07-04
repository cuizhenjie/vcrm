import { describe, it, expect } from "vitest";
import { validatePublicUrl } from "./ssrf-guard";

describe("SSRF 防护 URL 校验", () => {
  it("公网 https/http 通过", () => {
    expect(validatePublicUrl("https://example.com/hook")).toBeNull();
    expect(validatePublicUrl("http://203.0.113.5/callback")).toBeNull();
  });

  it("拒绝 loopback 127.x / localhost", () => {
    expect(validatePublicUrl("http://127.0.0.1/")).toMatch(/内网|本地/);
    expect(validatePublicUrl("http://localhost:8080/")).toMatch(/内网|本地/);
  });

  it("拒绝私网段 10/192.168/172.16-31", () => {
    expect(validatePublicUrl("http://10.0.0.1/")).toMatch(/内网/);
    expect(validatePublicUrl("http://192.168.1.1/")).toMatch(/内网/);
    expect(validatePublicUrl("http://172.16.0.1/")).toMatch(/内网/);
    expect(validatePublicUrl("http://172.31.255.255/")).toMatch(/内网/);
  });

  it("拒绝云元数据地址 169.254.169.254", () => {
    expect(validatePublicUrl("http://169.254.169.254/latest/meta-data/")).toMatch(/内网|链路/);
  });

  it("拒绝非 http 协议", () => {
    expect(validatePublicUrl("ftp://example.com/")).toMatch(/http/);
    expect(validatePublicUrl("javascript:alert(1)")).toMatch(/http|格式/);
  });

  it("拒绝非法 URL", () => {
    expect(validatePublicUrl("not-a-url")).toMatch(/格式/);
  });

  it("公网 172.32.x（非私网B）应通过", () => {
    expect(validatePublicUrl("http://172.32.0.1/")).toBeNull();
  });
});
