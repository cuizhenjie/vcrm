import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { queryVideoTask, cancelVideoTask } from "@/lib/ark-video";
import { refundVideoCredit, videoCostCredits } from "@/lib/video-billing";
import { persistVideoUrl } from "@/lib/video-storage";

export const dynamic = "force-dynamic";

/** 终态集合：succeeded/failed/cancelled 均不再轮询方舟。 */
const TERMINAL = new Set(["succeeded", "failed", "cancelled"]);

/** GET /api/video/[id] — 查询视频任务状态（前端轮询），同步回写 DB。
 *  生成失败时自动退还预扣额度。 */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const task = await db.videoTask.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  // 终态直接返回，不重复查方舟
  if (TERMINAL.has(task.status)) {
    return NextResponse.json(task);
  }

  // 非终态：查询方舟并回写
  if (!task.providerTaskId) {
    return NextResponse.json(task);
  }
  const result = await queryVideoTask(task.providerTaskId);
  if (result.ok && result.status) {
    const data: Record<string, unknown> = { status: result.status };
    if (result.thumbnailUrl) data.thumbnailUrl = result.thumbnailUrl;
    if (result.tokensUsed) data.tokensUsed = result.tokensUsed;
    // succeeded 时转存视频 URL（防方舟 24h 过期）
    if (result.status === "succeeded" && result.videoUrl) {
      const { url, persisted } = await persistVideoUrl(result.videoUrl, task.id);
      data.videoUrl = url;
      // 未转存时记录 error 提示（DB 查询时能看到 + 前端能取到）
      if (!persisted) {
        data.error = "视频链接 24 小时内有效，请及时下载；配置 VIDEO_S3_* 可自动永久转存";
      }
    } else if (result.videoUrl) {
      data.videoUrl = result.videoUrl;
    }
    await db.videoTask.update({ where: { id: task.id }, data });

    // 生成失败/取消：退还预扣额度（首次进入终态时退，refundVideoCredit 幂等）
    if (result.status === "failed" || result.status === "cancelled") {
      const params = task.paramsJson ? JSON.parse(task.paramsJson) : undefined;
      const credits = videoCostCredits(params);
      await refundVideoCredit(session.tenantId, task.id, credits);
    }
    return NextResponse.json({ ...task, ...data });
  }
  // 查询失败：返回当前 DB 状态（前端继续轮询）
  return NextResponse.json(task);
}

/** DELETE /api/video/[id] — 取消或删除视频任务。
 *  - 进行中(queued/running)：调方舟 DELETE 取消 → 本地标记 cancelled + 退还额度
 *  - 已终态：仅在本地标记 deleted（方舟任务已结束，无需再调）
 *  - 幂等：重复调用安全（cancelVideoTask/refundVideoCredit 均幂等） */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("sales");
  if (guard) return guard;
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const task = await db.videoTask.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!task) return NextResponse.json({ error: "任务不存在" }, { status: 404 });

  // 已终态：直接标记 cancelled（若已是 cancelled 则幂等无变化）
  if (TERMINAL.has(task.status)) {
    if (task.status !== "cancelled") {
      await db.videoTask.update({ where: { id: task.id }, data: { status: "cancelled" } });
    }
    return NextResponse.json({ ok: true, id: task.id, status: "cancelled" });
  }

  // 进行中：先调方舟取消，再回写本地
  let arkCancelled = true;
  if (task.providerTaskId) {
    const result = await cancelVideoTask(task.providerTaskId);
    // 方舟取消失败不阻塞本地标记（任务可能已终态或方舟不可达，以本地为准）
    arkCancelled = result.ok;
  }

  await db.videoTask.update({
    where: { id: task.id },
    data: { status: "cancelled", error: arkCancelled ? null : (task.error ?? undefined) },
  });

  // 退还预扣额度（幂等：已退过则不重复退）
  const taskParams = task.paramsJson ? JSON.parse(task.paramsJson) : undefined;
  const credits = videoCostCredits(taskParams);
  await refundVideoCredit(session.tenantId, task.id, credits);

  return NextResponse.json({ ok: true, id: task.id, status: "cancelled", arkCancelled });
}
