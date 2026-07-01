import { describe, expect, it, vi } from "vitest";
import { render, parseVars } from "./render";
import { abSignificance } from "./significance";
import { contentRiskReason, isUnsubscribeText, templateHasUnsubscribe } from "./compliance";

describe("template rendering", () => {
  it("renders built-in and custom variables", () => {
    const vars = { name: "李响", product: "重疾险", link: "https://v.crm/s/a1" };
    expect(render("尊敬的{name}，{product}续费：{link}", vars)).toBe("尊敬的李响，重疾险续费：https://v.crm/s/a1");
  });

  it("parses invalid custom variable JSON defensively", () => {
    expect(parseVars("{bad")).toEqual({});
  });
});

describe("A/B significance gate", () => {
  it("blocks rollout when sample size is below threshold", () => {
    vi.stubEnv("AB_MIN_SAMPLE", "30");
    const result = abSignificance([
      { id: "a", label: "A", sent: 10, visited: 4 },
      { id: "b", label: "B", sent: 10, visited: 1 },
    ]);
    expect(result.significant).toBe(false);
    expect(result.enoughSample).toBe(false);
  });

  it("allows rollout for a clearly significant winner", () => {
    vi.stubEnv("AB_MIN_SAMPLE", "30");
    const result = abSignificance([
      { id: "a", label: "A", sent: 200, visited: 70 },
      { id: "b", label: "B", sent: 200, visited: 25 },
    ]);
    expect(result.winner?.label).toBe("A");
    expect(result.significant).toBe(true);
  });
});

describe("commercial compliance", () => {
  it("recognizes unsubscribe replies", () => {
    expect(isUnsubscribeText("TD")).toBe(true);
    expect(isUnsubscribeText("请退订")).toBe(true);
  });

  it("requires marketing templates to include opt-out copy", () => {
    expect(templateHasUnsubscribe("新品促销，点击购买")).toBe(false);
    expect(contentRiskReason("新品促销，回TD退订")).toBeNull();
  });

  it("blocks sensitive wording", () => {
    expect(contentRiskReason("贷款黑户也包过，回TD退订")).toContain("敏感词");
  });
});

