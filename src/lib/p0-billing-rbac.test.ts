import { describe, it, expect } from "vitest";
import { videoCostCredits } from "./video-billing";
import { hasRole } from "./rbac";
import type { SessionIdentity } from "./auth";

describe("视频计费 videoCostCredits", () => {
  it("480p 5秒 = 5 条", () => {
    expect(videoCostCredits({ resolution: "480p", duration: 5 })).toBe(5);
  });
  it("1080p 5秒 = 20 条", () => {
    expect(videoCostCredits({ resolution: "1080p", duration: 5 })).toBe(20);
  });
  it("1080p 10秒 = 40 条（时长倍率2）", () => {
    expect(videoCostCredits({ resolution: "1080p", duration: 10 })).toBe(40);
  });
  it("4k 5秒 = 40 条", () => {
    expect(videoCostCredits({ resolution: "4k", duration: 5 })).toBe(40);
  });
  it("默认参数（无 resolution/duration）按 1080p/5s = 20", () => {
    expect(videoCostCredits()).toBe(20);
  });
  it("未知分辨率回落 1080p 价", () => {
    expect(videoCostCredits({ resolution: "8k", duration: 5 })).toBe(20);
  });
  it("3秒按时长倍率至少1倍 = base×1", () => {
    expect(videoCostCredits({ resolution: "720p", duration: 3 })).toBe(10);
  });
});

describe("角色权限 hasRole", () => {
  const mk = (role: string): SessionIdentity => ({ userId: "u1", tenantId: "t1", role });

  it("owner >= admin/sales/viewer", () => {
    expect(hasRole(mk("owner"), "admin")).toBe(true);
    expect(hasRole(mk("owner"), "sales")).toBe(true);
    expect(hasRole(mk("owner"), "viewer")).toBe(true);
  });
  it("admin >= sales 但 < owner", () => {
    expect(hasRole(mk("admin"), "sales")).toBe(true);
    expect(hasRole(mk("admin"), "owner")).toBe(false);
  });
  it("viewer 不能满足 sales 要求", () => {
    expect(hasRole(mk("viewer"), "sales")).toBe(false);
    expect(hasRole(mk("viewer"), "viewer")).toBe(true);
  });
  it("未知角色 = 无权限", () => {
    expect(hasRole(mk("unknown"), "viewer")).toBe(false);
  });
  it("null session = 无权限", () => {
    expect(hasRole(null, "viewer")).toBe(false);
  });
});
