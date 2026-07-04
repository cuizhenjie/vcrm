/**
 * 火山方舟（Volcengine Ark）视频生成 —— Seedance 模型适配。
 *
 * 文档：https://www.volcengine.com/docs/82379/1520757
 *
 * 调用模式（异步任务）：
 *   1. POST /api/v3/contents/generations/tasks 创建任务 → 返回 { id: "cgt-xxx" }
 *   2. GET  /api/v3/contents/generations/tasks/{id} 轮询 → status: queued/running/succeeded/failed
 *   3. succeeded 后 content.video_url（24h 失效，调用方需转存）
 *
 * 鉴权：Bearer ARK_API_KEY（数据面 API，无需 AK/SK 签名）。
 *
 * Seedance 2.5 仍在"即将上线"，先用 2.0 GA（model 可经 env ARK_VIDEO_MODEL 覆盖）。
 */

const ARK_BASE = () => (process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com").replace(/\/+$/, "");
const ARK_KEY = () => process.env.ARK_API_KEY?.trim();
const ARK_MODEL = () => process.env.ARK_VIDEO_MODEL || "doubao-seedance-2-0-260128";

export interface VideoParams {
  resolution?: string; // 480p | 720p | 1080p | 4k
  duration?: number; // 秒（2.0 支持 4/5/10；2.5 可达 30）
  fps?: number;
  ratio?: string; // 16:9 | 9:16 | 1:1
  seed?: number;
}

export interface CreateVideoInput {
  prompt: string;
  references?: Array<{ type: "image_url" | "video_url"; url: string }>;
  params?: VideoParams;
}

export interface VideoTaskResult {
  ok: boolean;
  providerTaskId?: string;
  status?: "queued" | "running" | "succeeded" | "failed";
  videoUrl?: string;
  thumbnailUrl?: string;
  error?: string;
  tokensUsed?: number;
  raw?: unknown;
}

export function isArkConfigured(): boolean {
  return !!ARK_KEY();
}

/** 创建视频生成任务（异步）。返回方舟任务 ID。 */
export async function createVideoTask(input: CreateVideoInput): Promise<VideoTaskResult> {
  if (!isArkConfigured()) return { ok: false, error: "ARK_API_KEY 未配置" };

  const content: any[] = [{ type: "text", text: input.prompt }];
  for (const ref of input.references ?? []) {
    content.push({ type: ref.type, [ref.type]: { url: ref.url } });
  }

  const body = {
    model: ARK_MODEL(),
    content,
    parameters: {
      resolution: input.params?.resolution ?? "1080p",
      duration: input.params?.duration ?? 5,
      fps: input.params?.fps ?? 24,
      ratio: input.params?.ratio ?? "16:9",
      ...(input.params?.seed !== undefined ? { seed: input.params.seed } : {}),
    },
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    const res = await fetch(`${ARK_BASE()}/api/v3/contents/generations/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ARK_KEY()}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: raw.error?.message ?? `HTTP_${res.status}`, raw };
    }
    return { ok: true, providerTaskId: raw.id, status: "queued", raw };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 查询视频任务状态。 */
export async function queryVideoTask(providerTaskId: string): Promise<VideoTaskResult> {
  if (!isArkConfigured()) return { ok: false, error: "ARK_API_KEY 未配置" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(`${ARK_BASE()}/api/v3/contents/generations/tasks/${providerTaskId}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${ARK_KEY()}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const raw = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: raw.error?.message ?? `HTTP_${res.status}`, raw };
    }
    const status = mapStatus(raw.status);
    const videoUrl = raw.content?.video_url;
    const thumbnailUrl = raw.content?.cover_image_url ?? raw.content?.thumbnail_url;
    return {
      ok: true,
      providerTaskId: raw.id,
      status,
      videoUrl,
      thumbnailUrl,
      tokensUsed: raw.usage?.total_tokens,
      raw,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** 方舟状态 → 标准状态（兼容多种返回值）。 */
function mapStatus(s: string): "queued" | "running" | "succeeded" | "failed" {
  const v = String(s ?? "").toLowerCase();
  if (v === "succeeded" || v === "success") return "succeeded";
  if (v === "failed" || v === "error" || v === "cancelled") return "failed";
  if (v === "running" || v === "processing") return "running";
  return "queued"; // queued/pending/等
}
