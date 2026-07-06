import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { smsUnitCostFen, InsufficientCreditsError } from "./billing";
import { smsUnitCost } from "./roi";
import { inQuietHours } from "./scheduler";

describe("billing: smsUnitCostFen 单价换算", () => {
  const ORIG = process.env.SMS_UNIT_COST;
  afterEach(() => { process.env.SMS_UNIT_COST = ORIG; });

  it("默认 0.05 元 → 5 分", () => {
    delete process.env.SMS_UNIT_COST;
    expect(smsUnitCostFen()).toBe(5);
  });
  it("0.1 元 → 10 分", () => {
    process.env.SMS_UNIT_COST = "0.1";
    expect(smsUnitCostFen()).toBe(10);
  });
  it("0.045 元 → 5 分（四舍五入）", () => {
    process.env.SMS_UNIT_COST = "0.045";
    expect(smsUnitCostFen()).toBe(5); // Math.round(4.5) = 5
  });
  it("0 元（免费通道）→ 0 分", () => {
    process.env.SMS_UNIT_COST = "0";
    expect(smsUnitCostFen()).toBe(0);
  });
  it("负值/NaN/非法 → 回落 5 分", () => {
    expect(smsUnitCostFen("-1")).toBe(5);
    expect(smsUnitCostFen("abc")).toBe(5);
    expect(smsUnitCostFen(undefined as any)).toBe(5);
  });
});

describe("billing: InsufficientCreditsError", () => {
  it("携带 balance 和 required", () => {
    const e = new InsufficientCreditsError(3, 5);
    expect(e.balance).toBe(3);
    expect(e.required).toBe(5);
    expect(e.message).toContain("3");
    expect(e.message).toContain("5");
    expect(e instanceof Error).toBe(true);
  });
});

describe("roi: smsUnitCost 单价（元）", () => {
  const ORIG = process.env.SMS_UNIT_COST;
  afterEach(() => { process.env.SMS_UNIT_COST = ORIG; });

  it("默认 0.05", () => {
    delete process.env.SMS_UNIT_COST;
    expect(smsUnitCost()).toBe(0.05);
  });
  it("显式 0 允许（免费通道）", () => {
    process.env.SMS_UNIT_COST = "0";
    expect(smsUnitCost()).toBe(0);
  });
  it("非法值回落默认", () => {
    expect(smsUnitCost("abc")).toBe(0.05);
    expect(smsUnitCost("-1")).toBe(0.05);
  });
  it("空白回落默认", () => {
    expect(smsUnitCost("  ")).toBe(0.05);
    expect(smsUnitCost("")).toBe(0.05);
  });
});

describe("scheduler: inQuietHours 跨午夜逻辑", () => {
  const ORIG_START = process.env.QUIET_START;
  const ORIG_END = process.env.QUIET_END;
  const ORIG_TZ = process.env.QUIET_TZ;
  beforeEach(() => {
    // 用固定 UTC 时间构造 Date，配合 UTC 时区测试，避免本地时区干扰
    process.env.QUIET_TZ = "UTC";
  });
  afterEach(() => {
    process.env.QUIET_START = ORIG_START;
    process.env.QUIET_END = ORIG_END;
    process.env.QUIET_TZ = ORIG_TZ;
  });

  it("默认 22-08：21点不命中，23点命中", () => {
    delete process.env.QUIET_START;
    delete process.env.QUIET_END;
    expect(inQuietHours(new Date("2026-01-01T21:00:00Z"))).toBe(false);
    expect(inQuietHours(new Date("2026-01-01T23:00:00Z"))).toBe(true);
  });
  it("默认 22-08：07点命中，08点不命中（跨午夜边界）", () => {
    delete process.env.QUIET_START;
    delete process.env.QUIET_END;
    expect(inQuietHours(new Date("2026-01-01T07:00:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-01-01T08:00:00Z"))).toBe(false);
  });
  it("自定义 9-18（白天时段，不跨午夜）", () => {
    process.env.QUIET_START = "9";
    process.env.QUIET_END = "18";
    expect(inQuietHours(new Date("2026-01-01T10:00:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-01-01T08:00:00Z"))).toBe(false);
    expect(inQuietHours(new Date("2026-01-01T20:00:00Z"))).toBe(false);
  });
  it("非法 START/END 回落 22-8", () => {
    process.env.QUIET_START = "abc";
    process.env.QUIET_END = "8";
    expect(inQuietHours(new Date("2026-01-01T23:00:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-01-01T10:00:00Z"))).toBe(false);
  });
  it("START > END 跨午夜（如 22-6）", () => {
    process.env.QUIET_START = "22";
    process.env.QUIET_END = "6";
    expect(inQuietHours(new Date("2026-01-01T23:00:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-01-01T03:00:00Z"))).toBe(true);
    expect(inQuietHours(new Date("2026-01-01T10:00:00Z"))).toBe(false);
  });
});
