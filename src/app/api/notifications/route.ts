import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/notifications — 列出当前用户的通知 + 未读数 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const [list, unreadCount] = await Promise.all([
    db.notification.findMany({
      where: {
        tenantId: session.tenantId,
        OR: [{ userId: null }, { userId: session.userId }],
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    db.notification.count({
      where: {
        tenantId: session.tenantId,
        read: false,
        OR: [{ userId: null }, { userId: session.userId }],
      },
    }),
  ]);
  return NextResponse.json({ list, unreadCount });
}

/** PATCH /api/notifications — 全部标记已读 */
export async function PATCH() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await db.notification.updateMany({
    where: {
      tenantId: session.tenantId,
      read: false,
      OR: [{ userId: null }, { userId: session.userId }],
    },
    data: { read: true },
  });
  return NextResponse.json({ ok: true });
}
