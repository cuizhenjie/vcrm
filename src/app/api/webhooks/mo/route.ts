import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyLianluSignature } from "@/lib/auth";
import { isUnsubscribeText, suppressMobile } from "@/lib/compliance";
import { emitOutboundEvent } from "@/lib/events";
import { currentTenantId } from "@/lib/tenant";

// 话术编排关键词（MVP 内置，可改为读 interaction_tpl）
const POSITIVE = /了解|明白|是的|好的|可以|需要|有兴趣/;
const NEGATIVE = /不|没有|不了解|拒绝|退订|TD/i;

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Webhook 签名校验（与 delivery 路由统一，缺 secret 配置则跳过用于 dev/mock）
  const appSecret = process.env.LIANLU_WEBHOOK_SECRET ?? "";
  if (appSecret) {
    const sig = req.headers.get("x-lianlu-signature");
    if (!verifyLianluSignature(rawBody, sig, appSecret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const body = JSON.parse(rawBody || "{}");
  const { mobile, content, extno } = body;
  if (!mobile || !content) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const matched = NEGATIVE.test(content) ? "negative" : POSITIVE.test(content) ? "positive" : "default";
  const recipient = extno
    ? await db.recipient.findUnique({ where: { extno } })
    : await db.recipient.findFirst({ where: { mobile }, orderBy: { createdAt: "desc" } });
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
