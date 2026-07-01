import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const tenantId = currentTenantId();
  const c = await db.campaign.findFirst({ where: { id: params.id, tenantId } });
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (["done"].includes(c.status)) return NextResponse.json({ error: "任务已完成，无法停止" }, { status: 400 });
  await db.campaign.update({ where: { id: c.id }, data: { status: "stopped" } });
  return NextResponse.json({ ok: true });
}
