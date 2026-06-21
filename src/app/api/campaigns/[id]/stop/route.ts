import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const c = await db.campaign.findUnique({ where: { id: params.id } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (["done"].includes(c.status)) return NextResponse.json({ error: "任务已完成，无法停止" }, { status: 400 });
  await db.campaign.update({ where: { id: params.id }, data: { status: "stopped" } });
  return NextResponse.json({ ok: true });
}
