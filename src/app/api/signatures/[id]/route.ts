import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { setDefaultSignature } from "@/lib/signature-service";

export const dynamic = "force-dynamic";

/** PATCH /api/signatures/[id] — 审核状态切换 / 设默认 / 改名 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const tid = session.tenantId;

  const data: Record<string, unknown> = {};
  const VALID_STATUS = ["draft", "pending", "approved", "rejected"];
  if (typeof body.reportStatus === "string" && VALID_STATUS.includes(body.reportStatus)) {
    data.reportStatus = body.reportStatus;
    data.reportReviewedAt = new Date();
    if (body.reportStatus === "rejected" && typeof body.rejectReason === "string") {
      data.rejectReason = body.rejectReason.trim().slice(0, 500);
    }
    if (body.reportStatus !== "rejected") data.rejectReason = null;
  }
  if (typeof body.signName === "string" && body.signName.trim()) {
    data.signName = body.signName.trim().slice(0, 50);
  }

  // 设为默认（单独处理，保证唯一性 + 必须审核通过）
  if (body.isDefault === true) {
    const ok = await setDefaultSignature(tid, params.id);
    if (!ok) return NextResponse.json({ error: "签名不存在或未审核通过，不能设为默认" }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const r = await db.smsSignature.updateMany({ where: { id: params.id, tenantId: tid }, data });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/signatures/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await db.smsSignature.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
