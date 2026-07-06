import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWebhookSignature } from "@/lib/webhook-guard";
import { suppressMobile } from "@/lib/compliance";
import { emitOutboundEvent } from "@/lib/events";
import { currentTenantId } from "@/lib/tenant";
import { findRecipientByCallback } from "@/lib/recipient-match";
import { matchIntent } from "@/lib/intent-service";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const guard = requireWebhookSignature(req, rawBody);
  if (guard) return guard;

  let body: any;
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { mobile, content, extno, messageId } = body;
  if (!mobile || !content) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const recipient = await findRecipientByCallback({ messageId, extno, mobile });
  const tenantId = recipient?.tenantId ?? currentTenantId();

  // 数据驱动意图匹配（DB 词库 + 内置兜底，替代硬编码正则）
  const intent = await matchIntent(content, tenantId);
  const matchedAttr = intent === "unsubscribe" ? "negative" : intent; // MO 表存 positive/negative/default
  const unsubscribed = intent === "unsubscribe";

  await db.moMessage.create({ data: { tenantId, recipientId: recipient?.id ?? null, mobile, content, matchedAttr } });
  if (recipient) {
    const tag = matchedAttr === "positive" ? "有意向" : matchedAttr === "negative" ? "无意向" : "未表态";
    await db.recipient.update({ where: { id: recipient.id }, data: { intentTag: tag } });
    await emitOutboundEvent("lead.updated", { recipientId: recipient.id, mobile, tag, content }, tenantId);
  }
  if (unsubscribed) {
    await suppressMobile({ tenantId, mobile, reason: "unsubscribe", source: "mo_webhook" });
    await emitOutboundEvent("customer.unsubscribed", { recipientId: recipient?.id ?? null, mobile, content }, tenantId);
  }
  return NextResponse.json({ ok: true, matched: matchedAttr, unsubscribed });
}
