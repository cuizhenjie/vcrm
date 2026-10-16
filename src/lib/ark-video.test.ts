import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  createVideoTask,
  queryVideoTask,
  cancelVideoTask,
  listVideoTasks,
  isArkConfigured,
} from "./ark-video";

/**
 * 火山方舟视频生成适配层测试。
 * 覆盖四个端点（创建/查询/取消/列表）+ 配置守卫 + 状态映射 + 错误处理。
 * 全程 mock fetch，不发真实网络请求。
 */

const ORIG_ENV = { ...process.env };

/** 构造 fetch Response mock（链式 .ok/.status/.json()）。 */
function mockResponse(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  const status = init.status ?? (ok ? 200 : 400);
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

beforeEach(() => {
  process.env = { ...ORIG_ENV };
  process.env.ARK_API_KEY = "ark-test-key-xxxx";
  process.env.ARK_BASE_URL = "https://ark.cn-beijing.volces.com";
  process.env.ARK_VIDEO_MODEL = "doubao-seedance-2-0-260128";
});

afterEach(() => {
  process.env = ORIG_ENV;
  vi.restoreAllMocks();
});

describe("isArkConfigured", () => {
  it("配置了 ARK_API_KEY 时返回 true", () => {
    expect(isArkConfigured()).toBe(true);
  });
  it("未配置 ARK_API_KEY 时返回 false", () => {
    delete process.env.ARK_API_KEY;
    expect(isArkConfigured()).toBe(false);
  });
  it("ARK_API_KEY 仅空白时返回 false", () => {
    process.env.ARK_API_KEY = "   ";
    expect(isArkConfigured()).toBe(false);
  });
});

describe("createVideoTask", () => {
  it("未配置 key 时直接返回失败，不发请求", async () => {
    delete process.env.ARK_API_KEY;
    const spy = vi.spyOn(global, "fetch");
    const r = await createVideoTask({ prompt: "测试" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/未配置/);
    expect(spy).not.toHaveBeenCalled();
  });

  it("成功创建任务：返回 providerTaskId + queued", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({ id: "cgt-abc123", status: "queued" }),
    );
    const r = await createVideoTask({ prompt: "一只猫", params: { resolution: "720p", duration: 5 } });
    expect(r.ok).toBe(true);
    expect(r.providerTaskId).toBe("cgt-abc123");
    expect(r.status).toBe("queued");
    // 校验请求：POST + 正确端点 + Bearer 鉴权 + model 透传
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks");
    expect(init?.method).toBe("POST");
    expect((init?.headers as any).Authorization).toBe("Bearer ark-test-key-xxxx");
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("doubao-seedance-2-0-260128");
    expect(body.content[0]).toEqual({ type: "text", text: "一只猫" });
    expect(body.parameters.resolution).toBe("720p");
  });

  it("方舟返回错误时透传 error 消息", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse(
        { error: { code: "UnsupportedModel", message: "model not valid" } },
        { ok: false, status: 400 },
      ),
    );
    const r = await createVideoTask({ prompt: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("model not valid");
  });

  it("网络异常时返回失败且不抛出", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));
    const r = await createVideoTask({ prompt: "x" });
    expect(r.ok).toBe(false);
    expect(r.error).toBe("network down");
  });
});

describe("queryVideoTask", () => {
  it("成功查询：succeeded 时返回 videoUrl + thumbnail", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({
        id: "cgt-1",
        status: "succeeded",
        content: { video_url: "https://ark/video.mp4", cover_image_url: "https://ark/cover.jpg" },
        usage: { total_tokens: 1200 },
      }),
    );
    const r = await queryVideoTask("cgt-1");
    expect(r.ok).toBe(true);
    expect(r.status).toBe("succeeded");
    expect(r.videoUrl).toBe("https://ark/video.mp4");
    expect(r.thumbnailUrl).toBe("https://ark/cover.jpg");
    expect(r.tokensUsed).toBe(1200);
  });

  it("running 状态正确映射", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({ id: "cgt-2", status: "running" }),
    );
    const r = await queryVideoTask("cgt-2");
    expect(r.status).toBe("running");
  });

  it("cancelled 状态映射为 cancelled（独立于 failed）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({ id: "cgt-3", status: "cancelled" }),
    );
    const r = await queryVideoTask("cgt-3");
    expect(r.status).toBe("cancelled");
  });

  it("failed/error 均映射为 failed", async () => {
    for (const s of ["failed", "error"]) {
      vi.spyOn(global, "fetch").mockResolvedValue(
        mockResponse({ id: "cgt-x", status: s }),
      );
      const r = await queryVideoTask("cgt-x");
      expect(r.status).toBe("failed");
    }
  });
});

describe("cancelVideoTask", () => {
  it("成功取消（204）：返回 cancelled 状态", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(mockResponse(null, { status: 204 }));
    const r = await cancelVideoTask("cgt-9");
    expect(r.ok).toBe(true);
    expect(r.status).toBe("cancelled");
    // 校验 DELETE 方法
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt-9");
    expect(init?.method).toBe("DELETE");
  });

  it("成功取消（200 + body）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(mockResponse({ id: "cgt-9" }));
    const r = await cancelVideoTask("cgt-9");
    expect(r.ok).toBe(true);
    expect(r.status).toBe("cancelled");
  });

  it("方舟返回失败时透传", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({ error: { message: "task not found" } }, { ok: false, status: 404 }),
    );
    const r = await cancelVideoTask("cgt-missing");
    expect(r.ok).toBe(false);
    expect(r.error).toBe("task not found");
  });

  it("未配置 key 时不发请求", async () => {
    delete process.env.ARK_API_KEY;
    const spy = vi.spyOn(global, "fetch");
    const r = await cancelVideoTask("cgt-1");
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("listVideoTasks", () => {
  it("成功返回标准化任务数组 + total", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({
        total: 2,
        items: [
          { id: "cgt-a", status: "succeeded", content: { video_url: "https://a.mp4" } },
          { id: "cgt-b", status: "queued" },
        ],
      }),
    );
    const r = await listVideoTasks({ pageNum: 1, pageSize: 10, status: "succeeded" });
    expect(r.ok).toBe(true);
    expect(r.total).toBe(2);
    expect(r.tasks).toHaveLength(2);
    expect(r.tasks![0]).toMatchObject({
      providerTaskId: "cgt-a",
      status: "succeeded",
      videoUrl: "https://a.mp4",
    });
    expect(r.tasks![1].status).toBe("queued");
    // 校验查询参数拼接
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("page_num=1");
    expect(url).toContain("page_size=10");
    expect(url).toContain("filter.status=succeeded");
    expect(url).toContain("/api/v3/contents/generations/tasks?");
  });

  it("taskIds 数组用逗号拼接", async () => {
    const spy = vi.spyOn(global, "fetch").mockResolvedValue(mockResponse({ total: 0, items: [] }));
    await listVideoTasks({ taskIds: ["cgt-1", "cgt-2"] });
    const url = spy.mock.calls[0][0] as string;
    expect(url).toContain("filter.task_ids=cgt-1%2Ccgt-2");
  });

  it("兼容 data 字段（部分版本返回 data 而非 items）", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({ total: 1, data: [{ id: "cgt-z", status: "running" }] }),
    );
    const r = await listVideoTasks();
    expect(r.tasks).toHaveLength(1);
    expect(r.tasks![0].providerTaskId).toBe("cgt-z");
  });

  it("未配置 key 时返回失败", async () => {
    delete process.env.ARK_API_KEY;
    const r = await listVideoTasks();
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/未配置/);
  });

  it("方舟错误透传", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(
      mockResponse({ error: { message: "invalid token" } }, { ok: false, status: 401 }),
    );
    const r = await listVideoTasks();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("invalid token");
  });
});
