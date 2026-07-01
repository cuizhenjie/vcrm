import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processCampaign } from "@/lib/tasks";
import { currentTenantId } from "@/lib/tenant";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const tenantId = currentTenantId();
  const campaign = await db.campaign.findFirst({ where: { id: params.id, tenantId } });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  // 定时发送：开始时间在未来 → 置为 scheduled，交给调度器
  if (campaign.scheduledAt && campaign.scheduledAt.getTime() > Date.now()) {
    await db.campaign.update({ where: { id: campaign.id }, data: { status: "scheduled" } });
    return NextResponse.json({ ok: true, scheduled: true, scheduledAt: campaign.scheduledAt });
  }
  const phase = campaign.autoRollout ? ("test" as const) : undefined;
  processCampaign(params.id, phase).catch((e) => console.error("processCampaign error", e));
  return NextResponse.json({ ok: true, message: campaign.autoRollout ? "测试阶段已开始发送" : "任务已开始发送" });
}
