import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** PATCH /api/notifications/[id] — 标记单条已读 */
export async function PATCH(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.notification.updateMany({
    where: { id: params.id, tenantId: session.tenantId },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
