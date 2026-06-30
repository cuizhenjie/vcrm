import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyLianluSignature } from "@/lib/auth";

/**
 * 联麓状态报告回调。
 * 签名：HMAC-SHA256(LIANLU_WEBHOOK_SECRET, raw_body) hex 大写，
 *       客户端通过 X-Lianlu-Signature 头传递。
 * ⚠ 实际字段名/签名方式以控制台文档为准，本实现按标准 HMAC 模式。
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const appSecret = process.env.LIANLU_WEBHOOK_SECRET ?? "";
  if (appSecret) {
    const sig = req.headers.get("x-lianlu-signature");
    if (!verifyLianluSignature(rawBody, sig, appSecret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }
  const body = JSON.parse(rawBody || "{}");
  const reports: Array<{ extno: string; status: string }> = body.reports ?? (Array.isArray(body) ? body : [body]);
  for (const r of reports) {
    const recipient = await db.recipient.findUnique({ where: { extno: r.extno } });
    if (!recipient) continue;
    const status = r.status === "DELIVRD" || r.status === "delivered" ? "delivered" : "undelivered";
    await db.recipient.update({ where: { id: recipient.id }, data: { deliveryStatus: status } });
    await db.deliveryReport.create({ data: { recipientId: recipient.id, status } });
  }
  return NextResponse.json({ ok: true });
}
