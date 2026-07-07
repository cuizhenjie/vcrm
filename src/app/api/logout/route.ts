import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { revokeSession } from "@/lib/session-service";

export const dynamic = "force-dynamic";

export async function POST() {
  // 吊销当前会话（使 DB 记录失效，即使 token 未过期也不能再用）
  const token = cookies().get("vcrm_session")?.value;
  await revokeSession(token).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set("vcrm_session", "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
