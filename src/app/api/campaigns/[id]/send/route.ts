import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processCampaign } from "@/lib/tasks";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const campaign = await db.campaign.findUnique({ where: { id: params.id } });
  // 自动放量活动：首次只发「测试阶段」，赢家确定后再放量
  const phase = campaign?.autoRollout ? ("test" as const) : undefined;
  processCampaign(params.id, phase).catch((e) => console.error("processCampaign error", e));
  return NextResponse.json({ ok: true, message: campaign?.autoRollout ? "测试阶段已开始发送" : "任务已开始发送" });
}
