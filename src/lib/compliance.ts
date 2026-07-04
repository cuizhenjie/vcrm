import { db } from "./db";
import { currentTenantId } from "./tenant";

const UNSUBSCRIBE_RE = /(退订|拒收|不再接收|td|t|n)/i;

/**
 * 内置兜底敏感词（DB 无配置时使用，覆盖行业通用高危词）。
 * 租户可在 SensitiveWord 表按自身业务增补，无需改码。
 */
const BUILTIN_SENSITIVE = [
  "贷款黑户", "包过", "稳赚", "博彩", "赌博", "发票",
  // 金融违规
  "套现", "洗钱", "代开发票", "刷单", "代还信用卡",
  // 医疗/保健违禁
  "丰胸", "增高", "壮阳", "性药", "梅毒", "淋病",
  // 违法/欺诈
  "办证", "刻章", "代考", "试卷答案", "走私", "管制刀具",
  // 投机/承诺收益
  "保本", "零风险", "日赚", "月入百万",
];

export function isUnsubscribeText(content: string): boolean {
  return UNSUBSCRIBE_RE.test(content.trim());
}

export function templateHasUnsubscribe(content: string): boolean {
  return /(退订|回T|回TD|拒收请回复)/i.test(content);
}

/**
 * 敏感词命中检测（数据驱动 + 进程内缓存）。
 * 词库来源：租户 SensitiveWord 表(active) ∪ 内置兜底词。
 * 缓存 TTL 由 SENSITIVE_CACHE_TTL_SEC 控制（默认 60s），命中后内存复用避免逐条查 DB。
 */
const cache = new Map<string, { words: Set<string>; at: number }>();
const CACHE_TTL = Number(process.env.SENSITIVE_CACHE_TTL_SEC ?? 60) * 1000;

export async function loadSensitiveWords(tenantId = currentTenantId()): Promise<Set<string>> {
  const now = Date.now();
  const hit = cache.get(tenantId);
  if (hit && now - hit.at < CACHE_TTL) return hit.words;

  // DB active 词 + 内置兜底
  const rows = await db.sensitiveWord.findMany({
    where: { tenantId, status: "active" },
    select: { word: true },
  });
  const words = new Set<string>([...BUILTIN_SENSITIVE, ...rows.map((r) => r.word)]);
  cache.set(tenantId, { words, at: now });
  return words;
}

/** 主动失效缓存（管理敏感词后调用，使新词立即生效）。 */
export function invalidateSensitiveCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

export async function contentRiskReason(content: string, tenantId = currentTenantId()): Promise<string | null> {
  const words = await loadSensitiveWords(tenantId);
  const hit = [...words].find((w) => content.includes(w));
  if (hit) return `命中敏感词：${hit}`;
  if (!templateHasUnsubscribe(content)) return "营销短信必须包含退订方式";
  return null;
}

/**
 * 同步兜底版本（仅用内置词，不查 DB）——供测试或不便异步的场景。
 * 生产路径请用异步 contentRiskReason。
 */
export function contentRiskReasonSync(content: string): string | null {
  const hit = BUILTIN_SENSITIVE.find((w) => content.includes(w));
  if (hit) return `命中敏感词：${hit}`;
  if (!templateHasUnsubscribe(content)) return "营销短信必须包含退订方式";
  return null;
}

export async function isSuppressed(mobile: string, tenantId = currentTenantId()): Promise<string | null> {
  const hit = await db.suppression.findUnique({
    where: { tenantId_mobile: { tenantId, mobile } },
    select: { reason: true },
  });
  return hit?.reason ?? null;
}

export async function suppressMobile(input: {
  tenantId?: string;
  mobile: string;
  reason: string;
  source?: string;
}) {
  const tenantId = input.tenantId ?? currentTenantId();
  await db.suppression.upsert({
    where: { tenantId_mobile: { tenantId, mobile: input.mobile } },
    update: { reason: input.reason, source: input.source },
    create: { tenantId, mobile: input.mobile, reason: input.reason, source: input.source },
  });
  await db.customer.updateMany({
    where: { tenantId, mobile: input.mobile },
    data: {
      isBlacklist: true,
      unsubscribedAt: input.reason === "unsubscribe" ? new Date() : undefined,
    },
  });
}
