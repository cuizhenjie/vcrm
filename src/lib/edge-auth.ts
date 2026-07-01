export const SESSION_COOKIE = "vcrm_session";

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

/** Edge Runtime session 校验；与 Node 端 signSession 的 token 格式兼容。 */
export async function verifyEdgeSession(token: string | undefined, secret: string): Promise<boolean> {
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [expiry, nonce, sig] = parts;
  const exp = Number(expiry);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;
  const expected = await hmacSha256Hex(secret, `${expiry}.${nonce}`);
  return constantTimeEqual(sig, expected);
}

