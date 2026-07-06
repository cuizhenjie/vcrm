import { NextResponse } from "next/server";
import { getCurrentSession } from "./session";
import type { SessionIdentity } from "./auth";

/**
 * 角色权限守卫（RBAC）。
 *
 * 角色层级（高→低）：owner > admin > sales > viewer
 *   - owner:  全部权限（含计费、成员、租户设置、删除）
 *   - admin:  除删除租户外的全部权限（含审核模板/签名、充值、发活动）
 *   - sales:  日常运营（建活动、改线索、看数据），不能改计费/签名审核/敏感词/webhook
 *   - viewer: 只读，不能任何写操作
 *
 * 兼容：env-admin（单管理员兼容模式）role 为 owner，权限最高。
 */

const LEVEL: Record<string, number> = {
  viewer: 1,
  sales: 2,
  admin: 3,
  owner: 4,
};

export type Role = "viewer" | "sales" | "admin" | "owner";

/** 判断 session 角色是否 >= 要求的最低角色。 */
export function hasRole(session: SessionIdentity | null, minRole: Role): boolean {
  if (!session) return false;
  return (LEVEL[session.role] ?? 0) >= (LEVEL[minRole] ?? 0);
}

/**
 * 守卫：要求登录 + 角色 ≥ minRole。
 * 用法：
 *   const guard = requireRole("admin");
 *   if (guard) return guard;  // 401 或 403
 */
export function requireRole(minRole: Role): NextResponse | null {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasRole(session, minRole)) {
    return NextResponse.json({ error: `权限不足（需 ${minRole} 及以上角色）` }, { status: 403 });
  }
  return null;
}

/** 守卫：要求登录即可（任何角色），用于需要登录但读写的路由。 */
export function requireLogin(): NextResponse | null {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
