import crypto from "node:crypto";
import { db } from "./db";

/**
 * 会话吊销服务（基于 AppSession 表）。
 *
 * 当前鉴权用无状态 HMAC token（auth.ts），token 本身不可撤销。
 * 通过 AppSession 表记录每个已签发 token 的 hash，吊销时标记 revokedAt。
 * getCurrentSession 校验时查 DB 确认未吊销。
 *
 * 性能：AppSession 查询按 tokenHash 唯一索引，单行查询开销极低。
 * 缓存优化可在后续迭代中加 Redis（tokenHash → 是否有效，TTL = session TTL）。
 */

/** 计算 token 的 hash（用于 AppSession.tokenHash 唯一索引）。 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 64);
}

/** 记录新会话（登录时调用）。 */
export async function recordSession(token: string, userId: string, tenantId: string): Promise<void> {
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // 7 天
  try {
    await db.appSession.create({
      data: { tenantId, userId, tokenHash, expiresAt },
    });
  } catch {
    // tokenHash 唯一冲突：理论上 nonce 随机不会重复，忽略
  }
}

/** 校验 token 是否有效（未被吊销且未过期）。返回 true=有效。 */
export async function isSessionValid(token: string | undefined): Promise<boolean> {
  if (!token) return true; // 无 token 走原逻辑（如 env-admin 兼容模式不写 session）
  const tokenHash = hashToken(token);
  const session = await db.appSession.findUnique({
    where: { tokenHash },
    select: { revokedAt: true, expiresAt: true },
  });
  if (!session) return true; // 未记录的 token（如 env-admin 兼容模式）默认放行
  if (session.revokedAt) return false; // 已吊销
  if (session.expiresAt < new Date()) return false; // 已过期
  return true;
}

/** 吊销当前会话（登出时调用）。 */
export async function revokeSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashToken(token);
  await db.appSession.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** 吊销某用户的所有会话（强制登出全部设备）。 */
export async function revokeAllUserSessions(userId: string): Promise<number> {
  const result = await db.appSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

/** 列出某用户的活跃会话（设备管理 UI 用）。 */
export async function listUserSessions(userId: string) {
  return db.appSession.findMany({
    where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, expiresAt: true },
  });
}
