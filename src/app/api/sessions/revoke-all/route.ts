import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { revokeAllUserSessions } from "@/lib/session-service";

export const dynamic = "force-dynamic";

/** POST /api/sessions/revoke-all — 吊销某用户的所有会话（强制登出全部设备）。
 *  admin 可指定 userId，普通用户只能吊销自己的。 */
export async function POST(req: Request) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  let targetUserId = session.userId;
  // admin 可吊销他人会话
  if (typeof body.userId === "string" && body.userId !== session.userId) {
    const guard = requireRole("admin");
    if (guard) return guard;
    targetUserId = body.userId;
  }

  const count = await revokeAllUserSessions(targetUserId);
  return NextResponse.json({ ok: true, revoked: count });
}
