import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { createVideoTask } from "@/lib/ark-video";
import { videoCostCredits, reserveVideoCredit, refundVideoCredit } from "@/lib/video-billing";
import { InsufficientCreditsError } from "@/lib/billing";
import { smsUnitCostFen } from "@/lib/billing";

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

/** POST /api/video — 创建视频生成任务 { prompt, references?, params? }
 *  计费：创建前预扣额度，方舟调用失败全额退还。 */
export async function POST(req: NextRequest) {
  const __guard = requireRole("sales");
  if (__guard) return __guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) return NextResponse.json({ error: "prompt 必填" }, { status: 400 });
  if (prompt.length > 5000) return NextResponse.json({ error: "prompt 过长（上限 5000 字符）" }, { status: 400 });

  const references = Array.isArray(body.references)
    ? body.references
        .filter((r: any) => r && typeof r.url === "string" && /^https?:\/\//.test(r.url) && (r.type === "image_url" || r.type === "video_url"))
        .slice(0, 50)
    : [];

  const params = body.params ?? {};
  // 计算成本（条等价额度）+ 折算分（用于 costFen 记录）
  const credits = videoCostCredits(params);
  const costFen = credits * smsUnitCostFen();

  // 先入库（状态 queued），拿到 taskId 再预扣
  const task = await db.videoTask.create({
    data: {
      tenantId: session.tenantId,
      userId: session.userId,
      prompt,
      referencesJson: references.length ? JSON.stringify(references) : null,
      paramsJson: body.params ? JSON.stringify(body.params) : null,
      status: "queued",
      costFen,
    },
  });

  // 预扣额度（不足则任务直接 failed，不入方舟）
  try {
    await reserveVideoCredit(session.tenantId, task.id, credits);
  } catch (e) {
    if (e instanceof InsufficientCreditsError) {
      await db.videoTask.update({
        where: { id: task.id },
        data: { status: "failed", error: e.message },
      });
      return NextResponse.json({ error: e.message, taskId: task.id }, { status: 402 });
    }
    throw e;
  }

  // 调方舟创建任务
  const result = await createVideoTask({ prompt, references, params: body.params });
  if (!result.ok) {
    // 方舟调用失败：全额退还 + 标记 failed
    await refundVideoCredit(session.tenantId, task.id, credits);
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
  return NextResponse.json({ ok: true, taskId: task.id, providerTaskId: result.providerTaskId, chargedCredits: credits });
}
