import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { listUserSessions } from "@/lib/session-service";

export const dynamic = "force-dynamic";

/** GET /api/sessions/devices — 当前用户的活跃会话（设备列表） */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const devices = await listUserSessions(session.userId);
  return NextResponse.json(devices);
}
