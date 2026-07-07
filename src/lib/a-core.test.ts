import { describe, it, expect } from "vitest";
import { makeSignature } from "./sms/lianlu";
import crypto from "node:crypto";
import { matchIntent } from "./intent-service";

// ============ A2: 联麓签名算法测试 ============
describe("联麓签名算法 makeSignature", () => {
  const KEY = "test-api-key-12345";

  it("参数按 ASCII 字典序排序", () => {
    const params = { Zebra: "1", Apple: "2", Middle: "3" };
    const sig = makeSignature(params, KEY);
    // 手工计算预期签名
    const expected = crypto
      .createHash("md5")
      .update("Apple=2&Middle=3&Zebra=1&key=" + KEY, "utf8")
      .digest("hex")
      .toUpperCase();
    expect(sig).toBe(expected);
  });

  it("排除集字段（PhoneNumberSet/SessionContext）不参与签名", () => {
    const params = {
      AppId: "app123",
      PhoneNumberSet: ["13800138000"], // 排除集
      SessionContext: "短信内容", // 排除集
      MchId: "mch456",
    };
    const sig = makeSignature(params, KEY);
    const expected = crypto
      .createHash("md5")
      .update("AppId=app123&MchId=mch456&key=" + KEY, "utf8")
      .digest("hex")
      .toUpperCase();
    expect(sig).toBe(expected);
  });

  it("空值字段被过滤", () => {
    const params = { A: "1", B: "", C: null as any, D: "4" };
    const sig = makeSignature(params, KEY);
    const expected = crypto
      .createHash("md5")
      .update("A=1&D=4&key=" + KEY, "utf8")
      .digest("hex")
      .toUpperCase();
    expect(sig).toBe(expected);
  });

  it("签名结果是 MD5 大写 hex（32字符）", () => {
    const sig = makeSignature({ AppId: "x" }, KEY);
    expect(sig).toMatch(/^[A-F0-9]{32}$/);
  });

  it("同一参数同一 key 签名一致（确定性）", () => {
    const params = { AppId: "x", MchId: "y", SignName: "【测试】" };
    expect(makeSignature(params, KEY)).toBe(makeSignature(params, KEY));
  });

  it("不同 key 签名不同", () => {
    const params = { AppId: "x" };
    expect(makeSignature(params, KEY)).not.toBe(makeSignature(params, "other-key"));
  });

  it("数组参数抛错（应加入排除集）", () => {
    expect(() => makeSignature({ BadArray: ["1", "2"] as any }, KEY)).toThrow(/数组参数/);
  });
});

// ============ A3: 意图匹配测试 ============
describe("意图匹配 matchIntent（内置兜底词）", () => {
  // matchIntent 是 async 且读 DB，测试用 mock 跳过 DB（传一个无 IntentKeyword 的租户）
  // 内置兜底词在 DB 无数据时生效

  it("退订关键词优先匹配（回T）", async () => {
    const r = await matchIntent("回T退订", "test-no-db-tenant");
    expect(r).toBe("unsubscribe");
  });

  it("退订：TD", async () => {
    const r = await matchIntent("TD", "test-no-db-tenant");
    expect(r).toBe("unsubscribe");
  });

  it("positive：需要", async () => {
    const r = await matchIntent("需要了解", "test-no-db-tenant");
    expect(r).toBe("positive");
  });

  it("negative：不需要", async () => {
    const r = await matchIntent("不需要", "test-no-db-tenant");
    expect(r).toBe("negative");
  });

  it("negative 优先于 positive（'不需要'含'需要'）", async () => {
    // "不需要"含"需要"——negative 先扫到
    const r = await matchIntent("不需要", "test-no-db-tenant");
    expect(r).not.toBe("positive");
  });

  it("未命中 → default", async () => {
    const r = await matchIntent("你好啊", "test-no-db-tenant");
    expect(r).toBe("default");
  });

  it("不把含 n/t 的英文误判为退订（修复验证）", async () => {
    // 修复前 isUnsubscribeRE 含裸 t/n/d，会误判
    const r1 = await matchIntent("interested", "test-no-db-tenant");
    expect(r1).not.toBe("unsubscribe");
    const r2 = await matchIntent("no thanks", "test-no-db-tenant");
    expect(r2).not.toBe("unsubscribe");
  });
});
