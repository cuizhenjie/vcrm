import { db } from "./db";
import { currentTenantId } from "./tenant";

const UNSUBSCRIBE_RE = /(退订|拒收|不再接收|td|t|n)/i;
const SENSITIVE_WORDS = ["贷款黑户", "包过", "稳赚", "博彩", "赌博", "发票"];

export function isUnsubscribeText(content: string): boolean {
  return UNSUBSCRIBE_RE.test(content.trim());
}

export function templateHasUnsubscribe(content: string): boolean {
  return /(退订|回T|回TD|拒收请回复)/i.test(content);
}

export function contentRiskReason(content: string): string | null {
  const hit = SENSITIVE_WORDS.find((word) => content.includes(word));
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

