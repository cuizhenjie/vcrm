import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { queryVideoTask } from "@/lib/ark-video";
import { refundVideoCredit, videoCostCredits } from "@/lib/video-billing";

export const dynamic = "force-dynamic";

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
  if (task.status === "succeeded" || task.status === "failed") {
    return NextResponse.json(task);
  }

  // 非终态：查询方舟并回写
  if (!task.providerTaskId) {
    return NextResponse.json(task);
  }
  const result = await queryVideoTask(task.providerTaskId);
  if (result.ok && result.status) {
    const data: Record<string, unknown> = { status: result.status };
    if (result.videoUrl) data.videoUrl = result.videoUrl;
    if (result.thumbnailUrl) data.thumbnailUrl = result.thumbnailUrl;
    if (result.tokensUsed) data.tokensUsed = result.tokensUsed;
    await db.videoTask.update({ where: { id: task.id }, data });

    // 生成失败：退还预扣额度（首次进入 failed 时退，refundVideoCredit 幂等）
    if (result.status === "failed") {
      const params = task.paramsJson ? JSON.parse(task.paramsJson) : undefined;
      const credits = videoCostCredits(params);
      await refundVideoCredit(session.tenantId, task.id, credits);
    }
    return NextResponse.json({ ...task, ...data });
  }
  // 查询失败：返回当前 DB 状态（前端继续轮询）
  return NextResponse.json(task);
}
