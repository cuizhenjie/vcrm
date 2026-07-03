import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWebhookSignature } from "@/lib/webhook-guard";
import { refundSmsCredit } from "@/lib/billing";
import { emitOutboundEvent } from "@/lib/events";

/**
 * 联麓状态报告回调。
 * 签名：HMAC-SHA256(LIANLU_WEBHOOK_SECRET, raw_body) hex 大写，
 *       客户端通过 X-Lianlu-Signature 头传递。
 * ⚠ 实际字段名/签名方式以控制台文档为准，本实现按标准 HMAC 模式。
 */
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
  const reports: Array<{ extno: string; status: string }> = body.reports ?? (Array.isArray(body) ? body : [body]);
  for (const r of reports) {
    const recipient = await db.recipient.findUnique({ where: { extno: r.extno } });
    if (!recipient) continue;
    const status = r.status === "DELIVRD" || r.status === "delivered" ? "delivered" : "undelivered";
    await db.$transaction(async (tx) => {
      await tx.recipient.update({ where: { id: recipient.id }, data: { deliveryStatus: status } });
      const exists = await tx.deliveryReport.findFirst({
        where: { recipientId: recipient.id, status },
        select: { id: true },
      });
      if (!exists) {
        await tx.deliveryReport.create({ data: { tenantId: recipient.tenantId, recipientId: recipient.id, status } });
      }
      if (status === "undelivered" && process.env.REFUND_UNDELIVERED === "true") {
        await refundSmsCredit(tx, { tenantId: recipient.tenantId, recipientId: recipient.id, reason: "refund_undelivered" });
      }
    });
    await emitOutboundEvent("message.delivery", { recipientId: recipient.id, mobile: recipient.mobile, status }, recipient.tenantId);
  }
  return NextResponse.json({ ok: true });
}
