import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getSessionSecret, verifySession, SESSION_COOKIE, SessionIdentity } from "./auth";

/**
 * Server 端（API 路由 / Server Component）获取当前会话身份。
 * - 在 Server Component / Route Handler 中用 getCurrentSession()（读 next/headers 的 cookies）。
 * - 在需要传 NextRequest 的场景用 parseSessionFromRequest(req)。
 *
 * 未登录返回 null。
 */

const FALLBACK: SessionIdentity = {
  userId: "env-admin",
  tenantId: "default_tenant",
  role: "owner",
};

/** 从 API 路由的 NextRequest 解析会话身份。 */
export function parseSessionFromRequest(req: NextRequest): SessionIdentity | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return verifySession(token, getSessionSecret());
}

/** 在 Route Handler / Server Component 中获取当前会话（基于 next/headers）。 */
export function getCurrentSession(): SessionIdentity | null {
  const token = cookies().get(SESSION_COOKIE)?.value;
  return verifySession(token, getSessionSecret());
}

/** 当前租户 ID：未登录回落到环境变量默认租户（兼容定时任务等无会话场景）。 */
export function currentTenantIdFromSession(): string {
  return getCurrentSession()?.tenantId ?? process.env.DEFAULT_TENANT_ID?.trim() ?? "default_tenant";
}
