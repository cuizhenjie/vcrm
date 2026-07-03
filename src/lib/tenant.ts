import { getCurrentSession } from "./session";

export const DEFAULT_TENANT_ID = "default_tenant";

/**
 * 当前租户 ID：从登录 session 解析；无 session（如定时任务、webhook 回调）回落到环境变量默认租户。
 * 这是多租户数据隔离的核心——所有按 tenantId 过滤的查询都应通过它获取当前租户。
 */
export function currentTenantId(): string {
  // 优先从 session 取（同步 API，cookies() 在 Route Handler 内同步可用）
  const session = getCurrentSession();
  if (session?.tenantId) return session.tenantId;
  return process.env.DEFAULT_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
}

export function actorName(): string {
  const session = getCurrentSession();
  if (session?.userId && session.userId !== "env-admin") return session.userId;
  return process.env.DEFAULT_ACTOR?.trim() || "运营";
}
