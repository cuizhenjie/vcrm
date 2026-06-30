/**
 * 认证工具：session 签名 + 生产环境强校验 + 联麓 Webhook 签名
 *
 * ⚠️ 关键约束：源码中不内嵌任何"危险默认 secret"字面量。
 *    生产环境必须通过环境变量 AUTH_SECRET 显式注入（>=32 字符）。
 *    开发环境未设环境变量时直接返回空串（middleware 会拦截所有请求，强制运维显式设值）。
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

/** 签名 session token：HMAC-SHA256(secret, payload) */
export function signSession(secret: string): string {
  const expiry = Date.now() + SESSION_TTL_SEC * 1000;
  const nonce = crypto.randomBytes(8).toString("hex");
  const payload = `${expiry}.${nonce}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

/** 校验 session token：未过期 + 签名匹配（防时序攻击） */
export function verifySession(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiry, nonce, sig] = parts;
  const exp = Number(expiry);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${expiry}.${nonce}`).digest("hex");
  try {
    if (sig.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
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
