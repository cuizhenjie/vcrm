export const DEFAULT_TENANT_ID = "default_tenant";

/** 当前版本保持单租户兼容；后续多用户登录后从 session 解析 tenantId。 */
export function currentTenantId(): string {
  return process.env.DEFAULT_TENANT_ID?.trim() || DEFAULT_TENANT_ID;
}

export function actorName(): string {
  return process.env.DEFAULT_ACTOR?.trim() || "运营";
}

