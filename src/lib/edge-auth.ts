export const SESSION_COOKIE = "vcrm_session";

export interface EdgeSessionIdentity {
  userId: string;
  tenantId: string;
  role: string;
}

const FALLBACK_IDENTITY: EdgeSessionIdentity = {
  userId: "env-admin",
  tenantId: "default_tenant",
  role: "owner",
};

export function getEdgeSessionSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === "production") {
    if (!s) throw new Error("[FATAL] AUTH_SECRET 未设置，生产环境强制失败");
    if (s.length < 32) throw new Error(`[FATAL] AUTH_SECRET 长度不足（${s.length} < 32）`);
  }
  return s ?? "";
}

const encoder = new TextEncoder();

const bytesToHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

async function hmacSha256Hex(secret: string, payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return bytesToHex(sig);
}

/**
 * Edge Runtime session 校验；与 Node 端 signSession 的 token 格式兼容。
 * v2 格式 expiry.userId.tenantId.role.sig → 解析出身份信息。
 * 旧格式已废弃（权限提升风险），不再兼容。
 * 返回 null 表示校验失败/过期。
 */
export async function verifyEdgeSession(
  token: string | undefined,
  secret: string,
): Promise<EdgeSessionIdentity | null> {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 5) return null; // 仅接受 v2 格式
  const [expiry, userId, tenantId, role, sig] = parts;
  const exp = Number(expiry);
  if (!Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = await hmacSha256Hex(secret, `${expiry}.${userId}.${tenantId}.${role}`);
  if (!constantTimeEqual(sig, expected)) return null;
  return { userId, tenantId, role };
}
