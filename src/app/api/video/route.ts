import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { createVideoTask } from "@/lib/ark-video";

export const dynamic = "force-dynamic";

/** GET /api/video — 列出租户的视频生成任务 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db.videoTask.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json(list);
}

/** POST /api/video — 创建视频生成任务 { prompt, references?, params? } */
export async function POST(req: NextRequest) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt 必填" }, { status: 400 });
  if (prompt.length > 5000) return NextResponse.json({ error: "prompt 过长（上限 5000 字符）" }, { status: 400 });

  const references = Array.isArray(body.references)
    ? body.references
        .filter((r: any) => r && typeof r.url === "string" && /^https?:\/\//.test(r.url) && (r.type === "image_url" || r.type === "video_url"))
        .slice(0, 50)
    : [];

  // 先入库（状态 queued），再调方舟
  const task = await db.videoTask.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      prompt,
      referencesJson: references.length ? JSON.stringify(references) : null,
      paramsJson: body.params ? JSON.stringify(body.params) : null,
      status: "queued",
    },
  });

  const result = await createVideoTask({ prompt, references, params: body.params });
  if (!result.ok) {
    await db.videoTask.update({
      where: { id: task.id },
      data: { status: "failed", error: result.error ?? "create_failed" },
    });
    return NextResponse.json({ error: result.error ?? "创建任务失败", taskId: task.id }, { status: 502 });
  }

  await db.videoTask.update({
    where: { id: task.id },
    data: { providerTaskId: result.providerTaskId, status: "queued" },
  });
  return NextResponse.json({ ok: true, taskId: task.id, providerTaskId: result.providerTaskId });
}
