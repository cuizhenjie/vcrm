import { NextResponse } from "next/server";
import { processCampaign } from "@/lib/tasks";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  // MVP：异步触发不阻塞响应（生产改为入队 BullMQ）
  processCampaign(params.id).catch((e) => console.error("processCampaign error", e));
  return NextResponse.json({ ok: true, message: "任务已开始发送" });
}
