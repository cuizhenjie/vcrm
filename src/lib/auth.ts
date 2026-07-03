/**
 * 认证工具：session 签名 + 生产环境强校验 + 联麓 Webhook 签名
 *
 * Session token 格式（v2，携带身份信息）：
 *   expiry.userId.tenantId.role.signature
 *   其中 signature = HMAC-SHA256(secret, expiry.userId.tenantId.role)
 *   Edge middleware 可直接解析出 tenantId/role，无需查 DB。
 *
 * 向后兼容：仍支持旧格式 expiry.nonce.sig（无身份信息），此时身份回落为
 *   default_tenant / owner（单管理员兼容模式）。
 *
 * ⚠️ 关键约束：源码中不内嵌任何"危险默认 secret"字面量。
 *    生产环境必须通过环境变量 AUTH_SECRET 显式注入（>=32 字符）。
 */
import crypto from "crypto";

/** 启动期强校验：生产环境 AUTH_SECRET 必须设置 */
export function getSessionSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!s) {
      throw new Error("[FATAL] AUTH_SECRET 未设置，生产环境强制失败");
    }
    if (s.length < 32) {
      throw new Error(`[FATAL] AUTH_SECRET 长度不足（${s.length} < 32），请用 openssl rand -hex 32 生成`);
    }
  }
  return s ?? "";
}

/**
 * 启动期强校验已迁移到 instrumentation.ts（Node.js runtime 启动钩子）
 * middleware.ts 仅做运行时校验，兼容 Edge Runtime
 */
export function assertProdSecretOrExit(): void {
  throw new Error("assertProdSecretOrExit 仅在 instrumentation 启动期调用，middleware 请使用 getSessionSecret()");
}

export const SESSION_COOKIE = "vcrm_session";
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

export interface SessionIdentity {
  userId: string;
  tenantId: string;
  role: string;
}

const FALLBACK_IDENTITY: SessionIdentity = {
  userId: "env-admin",
  tenantId: "default_tenant",
  role: "owner",
};

/** 签名 session token（v2：携带身份信息）。 */
export function signSession(secret: string, identity?: SessionIdentity): string {
  const expiry = Date.now() + SESSION_TTL_SEC * 1000;
  const id = identity ?? FALLBACK_IDENTITY;
  const payload = `${expiry}.${id.userId}.${id.tenantId}.${id.role}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/**
 * 校验 session token：未过期 + 签名匹配（防时序攻击）。
 * 返回解析出的身份信息；签名失败或过期返回 null。
 *
 * 安全说明：旧格式（expiry.nonce.sig）已废弃——旧格式校验通过即获得 fallback owner
 * 身份，是权限提升漏洞。多租户上线后所有 token 必须是 v2 格式（携带身份绑定）。
 */
export function verifySession(token: string | undefined, secret: string): SessionIdentity | null {
  if (!token) return null;
  const parts = token.split(".");
  // 仅接受 v2 格式：expiry.userId.tenantId.role.sig（5 段）
  if (parts.length !== 5) return null;
  const [expiry, userId, tenantId, role, sig] = parts;
  const exp = Number(expiry);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const payload = `${expiry}.${userId}.${tenantId}.${role}`;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    if (sig.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  } catch {
    return null;
  }
  return { userId, tenantId, role };
}

/** 联麓 Webhook 签名校验（HMAC-SHA256 over raw body） */
export function verifyLianluSignature(
  rawBody: string,
  signature: string | null,
  appSecret: string
): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  try {
    if (signature.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}
