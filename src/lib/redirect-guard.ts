/**
 * 短链开放重定向防护。
 *
 * 短链域名是官方高信誉域名（被短信大量下发），若允许跳转到任意 URL，
 * 攻击者可注入钓鱼链接伪装成官方短信。这里限制 targetUrl 只能跳到白名单 host。
 *
 * 白名单来源：
 *   1. REDIRECT_ALLOWED_HOSTS env（逗号分隔，如 "example.com,shop.example.com"）
 *   2. APP_BASE_URL 的 host（本站落地页）
 */

export function isAllowedRedirectHost(targetUrl: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    return false;
  }
  // 仅允许 http/https，禁 file/data/javascript 等协议
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const allowed = new Set<string>();
  // APP_BASE_URL 的 host
  const base = process.env.APP_BASE_URL;
  if (base) {
    try {
      allowed.add(new URL(base).host);
    } catch {
      // ignore
    }
  }
  // 显式白名单
  const extra = process.env.REDIRECT_ALLOWED_HOSTS ?? "";
  extra.split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .forEach((h) => allowed.add(h));

  // 未配置任何白名单时：仅允许与 APP_BASE_URL 同 host（最严格）
  const target = parsed.host.toLowerCase();
  if (allowed.size === 0) {
    return base ? target === new URL(base).host.toLowerCase() : false;
  }
  return allowed.has(target);
}
