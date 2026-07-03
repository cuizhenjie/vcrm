import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireWebhookSignature } from "@/lib/webhook-guard";
import { refundSmsCredit } from "@/lib/billing";
import { emitOutboundEvent } from "@/lib/events";
import { findRecipientByCallback } from "@/lib/recipient-match";

/**
 * 联麓状态报告回调。
 * 签名：HMAC-SHA256(LIANLU_WEBHOOK_SECRET, raw_body) hex 大写，
 *       客户端通过 X-Lianlu-Signature 头传递。
 * ⚠ 实际字段名/签名方式以控制台文档为准，本实现按标准 HMAC 模式。
 *
 * 回执关联（v2）：优先用通道流水号 messageId（与发送侧落库的
 * MessageAttempt.providerMessageId 对齐），extno/mobile 作为兜底。
 * 回执字段名可通过 env LIANLU_DELIVERY_*_FIELD 调整以适配真实响应结构。
 */
type DeliveryReportItem = {
  messageId?: string;
  extno?: string;
  mobile?: string;
  status?: string;
};

const REPORTS_FIELD = process.env.LIANLU_DELIVERY_REPORTS_FIELD?.trim() || "reports";
const MESSAGE_ID_FIELD = process.env.LIANLU_DELIVERY_MESSAGE_ID_FIELD?.trim() || "messageId";
const EXTLNO_FIELD = process.env.LIANLU_DELIVERY_EXTNO_FIELD?.trim() || "extno";
const MOBILE_FIELD = process.env.LIANLU_DELIVERY_MOBILE_FIELD?.trim() || "mobile";
const STATUS_FIELD = process.env.LIANLU_DELIVERY_STATUS_FIELD?.trim() || "status";

/** 从单条回执对象中提取标准化字段（兼容不同字段命名）。 */
function normalizeReport(item: any): DeliveryReportItem {
  if (!item || typeof item !== "object") return {};
  return {
    messageId: pickStr(item, [MESSAGE_ID_FIELD, "messageId", "MessageId", "MsgId", "TaskId"]),
    extno: pickStr(item, [EXTLNO_FIELD, "extno", "ExtNo", "Tag", "tag"]),
    mobile: pickStr(item, [MOBILE_FIELD, "mobile", "Mobile", "PhoneNumber", "phone"]),
    status: pickStr(item, [STATUS_FIELD, "status", "Status", "ReportStatus", "Stat"]),
  };
}

function pickStr(obj: any, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return undefined;
}

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

  const rawReports = body[REPORTS_FIELD] ?? (Array.isArray(body) ? body : [body]);
  const reports: DeliveryReportItem[] = Array.isArray(rawReports)
    ? rawReports.map(normalizeReport)
    : [normalizeReport(rawReports)];

  for (const r of reports) {
    const recipient = await findRecipientByCallback({
      messageId: r.messageId,
      extno: r.extno,
      mobile: r.mobile,
    });
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
