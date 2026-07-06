import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { contentRiskReason } from "@/lib/compliance";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/templates/[id] —— 模板审核 / 编辑 / 重新提交
 * body:
 *   { action: "approve" }                              → approved（修复发送门禁断链：这是唯一产出 approved 的路径）
 *   { action: "reject", reason }                       → rejected + rejectReason
 *   { action: "resubmit", content?, landingUrl?, signatureId? } → 改内容后回 pending（重审），content 改了会重跑敏感词
 *   { content, landingUrl, signatureId, name, type }   → 直接编辑（不改状态）
 */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  // 审核操作(approve/reject)需 admin；普通编辑/重新提交 sales 即可
  const body = await req.json().catch(() => ({}));
  const needAdmin = body.action === "approve" || body.action === "reject";
  const guard = requireRole(needAdmin ? "admin" : "sales");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const tid = session.tenantId;

  const tpl = await db.smsTemplate.findFirst({ where: { id: params.id, tenantId: tid } });
  if (!tpl) return NextResponse.json({ error: "模板不存在" }, { status: 404 });

  if (body.action === "approve") {
    await db.smsTemplate.update({
      where: { id: params.id },
      data: { reportStatus: "approved", reportReviewedAt: new Date(), rejectReason: null },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reject") {
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "审核未通过";
    await db.smsTemplate.update({
      where: { id: params.id },
      data: { reportStatus: "rejected", reportReviewedAt: new Date(), rejectReason: reason },
    });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "resubmit") {
    // 重新提交：可选更新内容，改了内容要重跑敏感词检测
    const data: Record<string, unknown> = { reportStatus: "pending", reportSubmittedAt: new Date(), rejectReason: null };
    if (typeof body.content === "string" && body.content.trim()) {
      const risk = await contentRiskReason(body.content, tid);
      if (risk) {
        await db.smsTemplate.update({
          where: { id: params.id },
          data: { content: body.content, reportStatus: "rejected", reportReviewedAt: new Date(), rejectReason: risk },
        });
        return NextResponse.json({ error: `内容未通过审核：${risk}` }, { status: 400 });
      }
      data.content = body.content;
    }
    if (typeof body.landingUrl === "string") data.landingUrl = body.landingUrl || null;
    if (typeof body.signatureId === "string") data.signatureId = body.signatureId || null;
    await db.smsTemplate.update({ where: { id: params.id }, data });
    return NextResponse.json({ ok: true });
  }

  // 普通编辑（不改审核状态）—— 但改 content 必须回 pending 重审，防审核绕过
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 100);
  if (typeof body.type === "string") data.type = body.type;
  if (typeof body.content === "string" && body.content.trim() && body.content !== tpl.content) {
    // 内容变更：重跑敏感词 + 强制回 pending 重审（防审核绕过）
    const risk = await contentRiskReason(body.content, tid);
    if (risk) {
      await db.smsTemplate.update({
        where: { id: params.id },
        data: { content: body.content, reportStatus: "rejected", reportReviewedAt: new Date(), rejectReason: risk },
      });
      return NextResponse.json({ error: `内容未通过审核：${risk}` }, { status: 400 });
    }
    data.content = body.content;
    data.reportStatus = "pending";
    data.reportSubmittedAt = new Date();
    data.rejectReason = null;
  }
  if (typeof body.landingUrl === "string") data.landingUrl = body.landingUrl || null;
  if (typeof body.signatureId === "string") data.signatureId = body.signatureId || null;
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "无更新字段" }, { status: 400 });
  await db.smsTemplate.update({ where: { id: params.id }, data });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const r = await db.smsTemplate.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  if (r.count === 0) return NextResponse.json({ error: "不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
