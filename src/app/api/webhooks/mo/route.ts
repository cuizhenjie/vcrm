import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWebhookSignature } from "@/lib/webhook-guard";
import { isUnsubscribeText, suppressMobile } from "@/lib/compliance";
import { emitOutboundEvent } from "@/lib/events";
import { currentTenantId } from "@/lib/tenant";
import { findRecipientByCallback } from "@/lib/recipient-match";

// 话术编排关键词（MVP 内置，可改为读 interaction_tpl）
const POSITIVE = /了解|明白|是的|好的|可以|需要|有兴趣/;
const NEGATIVE = /不|没有|不了解|拒绝|退订|TD/i;

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

  const matched = NEGATIVE.test(content) ? "negative" : POSITIVE.test(content) ? "positive" : "default";
  const recipient = await findRecipientByCallback({ messageId, extno, mobile });
  const tenantId = recipient?.tenantId ?? currentTenantId();
  const unsubscribed = isUnsubscribeText(content);

  await db.moMessage.create({ data: { tenantId, recipientId: recipient?.id ?? null, mobile, content, matchedAttr: matched } });
  if (recipient) {
    const tag = matched === "positive" ? "有意向" : matched === "negative" ? "无意向" : "未表态";
    await db.recipient.update({ where: { id: recipient.id }, data: { intentTag: tag } });
    await emitOutboundEvent("lead.updated", { recipientId: recipient.id, mobile, tag, content }, tenantId);
  }
  if (unsubscribed) {
    await suppressMobile({ tenantId, mobile, reason: "unsubscribe", source: "mo_webhook" });
    await emitOutboundEvent("customer.unsubscribed", { recipientId: recipient?.id ?? null, mobile, content }, tenantId);
  }
  return NextResponse.json({ ok: true, matched, unsubscribed });
}
