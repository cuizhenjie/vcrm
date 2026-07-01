import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

/** 删除单条分群预设 */
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const tenantId = currentTenantId();
  const existing = await db.segmentPreset.findFirst({ where: { tenantId, id: params.id } });
  if (!existing) return NextResponse.json({ error: "不存在" }, { status: 404 });
  await db.segmentPreset.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
