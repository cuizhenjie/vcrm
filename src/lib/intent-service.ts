import { db } from "./db";
import { isUnsubscribeText } from "./compliance";

/**
 * MO 上行回复意图匹配（数据驱动）。
 * 词库来源：租户 IntentKeyword 表(active) ∪ 内置兜底词。
 * 优先级：退订检测 → negative → positive → default
 */

// 内置兜底（DB 无配置时用，保证开箱即用）
const BUILTIN: Record<string, string[]> = {
  positive: ["了解", "明白", "是的", "好的", "可以", "需要", "有兴趣", "想了解", "多少钱", "怎么办理"],
  negative: ["不需要", "没有", "不了解", "不感兴趣", "拒绝", "别发了", "不要再发"],
};

const cache = new Map<string, { words: Map<string, string>; at: number }>();
const CACHE_TTL = 60_000;

/** 加载租户意图词库（intent → 词列表）。带 60s 进程缓存。 */
async function loadIntentWords(tenantId: string): Promise<Map<string, string>> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.words;

  const rows = await db.intentKeyword.findMany({
    where: { tenantId, status: "active" },
    select: { word: true, intent: true },
  });
  const words = new Map<string, string>();
  // DB 词优先
  for (const r of rows) words.set(r.word, r.intent);
  // 内置兜底（不覆盖 DB）
  for (const [intent, list] of Object.entries(BUILTIN)) {
    for (const w of list) if (!words.has(w)) words.set(w, intent);
  }
  cache.set(tenantId, { words, at: Date.now() });
  return words;
}

/** 失效缓存（管理词库后调用）。 */
export function invalidateIntentCache(tenantId?: string): void {
  if (tenantId) cache.delete(tenantId);
  else cache.clear();
}

/** 匹配上行回复的意图。
 *  返回：positive | negative | unsubscribe | default */
export async function matchIntent(content: string, tenantId: string): Promise<"positive" | "negative" | "unsubscribe" | "default"> {
  const text = content.trim();
  // 1. 退订检测（最高优先级）
  if (isUnsubscribeText(text)) return "unsubscribe";
  // 2. 关键词匹配（negative 优先于 positive）
  const words = await loadIntentWords(tenantId);
  let matched: string | null = null;
  // 先扫 negative
  for (const [word, intent] of words) {
    if (intent === "negative" && text.includes(word)) { matched = "negative"; break; }
  }
  if (!matched) {
    for (const [word, intent] of words) {
      if (intent === "positive" && text.includes(word)) { matched = "positive"; break; }
    }
  }
  return (matched as any) ?? "default";
}
