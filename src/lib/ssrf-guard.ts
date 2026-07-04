/**
 * SSRF 防护：校验 URL 是否指向公网地址。
 *
 * Webhook URL 会被服务端 fetch（event-dispatcher），若允许内网/loopback/云元数据地址，
 * 攻击者可探测内网或窃取云凭证（如 169.254.169.254）。
 * 拒绝：loopback、私网段、链路本地、未解析域名。
 */

const PRIVATE_PATTERNS = [
  /^127\./, // loopback
  /^10\./, // 私网 A
  /^192\.168\./, // 私网 C
  /^172\.(1[6-9]|2\d|3[01])\./, // 私网 B
  /^169\.254\./, // 链路本地（含云元数据 169.254.169.254）
  /^0\./, // 本网
  /^::1$/, // IPv6 loopback
  /^fc00:/i, // IPv6 唯一本地
  /^fe80:/i, // IPv6 链路本地
];

const BLOCKED_HOSTS = ["localhost", "metadata.google.internal"];

/** 校验 URL 是否为合法公网 http(s) 地址。返回错误描述或 null（通过）。 */
export function validatePublicUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return "URL 格式不正确";
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return "仅支持 http/https 协议";
  }
  const host = parsed.hostname.toLowerCase();

  // 拒绝已知危险 host
  if (BLOCKED_HOSTS.includes(host)) return "禁止指向内网/本地地址";

  // 纯 IPv4 / IPv6 字面量 → 检查私网段
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) {
    if (PRIVATE_PATTERNS.some((re) => re.test(host))) {
      return "禁止指向内网/本地/链路本地地址";
    }
  }

  return null;
}
