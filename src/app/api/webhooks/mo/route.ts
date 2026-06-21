import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// 话术编排关键词（MVP 内置，可改为读 interaction_tpl）
const POSITIVE = /了解|明白|是的|好的|可以|需要|有兴趣/;
const NEGATIVE = /不|没有|不了解|拒绝|退订|TD/i;

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { mobile, content, extno } = body;
  if (!mobile || !content) return NextResponse.json({ error: "bad payload" }, { status: 400 });

  const matched = NEGATIVE.test(content) ? "negative" : POSITIVE.test(content) ? "positive" : "default";
  const recipient = extno
    ? await db.recipient.findUnique({ where: { extno } })
    : await db.recipient.findFirst({ where: { mobile }, orderBy: { createdAt: "desc" } });

  await db.moMessage.create({ data: { recipientId: recipient?.id ?? null, mobile, content, matchedAttr: matched } });
  if (recipient) {
    const tag = matched === "positive" ? "有意向" : matched === "negative" ? "无意向" : "未表态";
    await db.recipient.update({ where: { id: recipient.id }, data: { intentTag: tag } });
  }
  return NextResponse.json({ ok: true, matched });
}
