/**
 * PII（个人身份信息）脱敏工具，用于日志输出。
 *
 * 手机号、邮箱等在 console.error / 日志中应脱敏，
 * 防止日志聚合后泄露用户隐私。
 */

/** 手机号脱敏：保留前 3 后 4，中间 4 位 *。如 138****1234 */
export function maskMobile(mobile: string | undefined | null): string {
  if (!mobile) return "";
  const s = String(mobile);
  if (s.length !== 11) return "***";
  return `${s.slice(0, 3)}****${s.slice(7)}`;
}

/** 邮箱脱敏：用户名首字符 + *** + @域名。如 a***@example.com */
export function maskEmail(email: string | undefined | null): string {
  if (!email) return "";
  const s = String(email);
  const at = s.indexOf("@");
  if (at < 1) return "***";
  return `${s[0]}***${s.slice(at)}`;
}

/** 对任意对象做 PII 脱敏，返回安全可打印的字符串。 */
export function safeLog(obj: unknown): string {
  if (obj == null) return String(obj);
  if (typeof obj === "string") return obj;
  try {
    return JSON.stringify(obj, (key, value) => {
      const lk = key.toLowerCase();
      if (lk === "mobile" || lk === "phone" || lk === "phonenumberset") return maskMobile(value);
      if (lk === "email") return maskEmail(value);
      if (lk === "password" || lk === "passwordhash" || lk === "secret" || lk === "apikey") return "***";
      return value;
    });
  } catch {
    return "[unserializable]";
  }
}
