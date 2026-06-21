import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * 联麓状态报告回调。⚠ 实际字段名/签名校验以控制台文档为准。
 * 这里假设回推 { extno, status } 列表。靠 extno 精确回填到 recipient。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const reports: Array<{ extno: string; status: string }> = body.reports ?? (Array.isArray(body) ? body : [body]);

  for (const r of reports) {
    const recipient = await db.recipient.findUnique({ where: { extno: r.extno } });
    if (!recipient) continue;
    const status = r.status === "DELIVRD" || r.status === "delivered" ? "delivered" : "undelivered";
    await db.recipient.update({ where: { id: recipient.id }, data: { deliveryStatus: status } });
    await db.deliveryReport.create({ data: { recipientId: recipient.id, status } });
  }
  // ⚠ 联麓可能要求返回特定确认串，以文档为准
  return NextResponse.json({ ok: true });
}
