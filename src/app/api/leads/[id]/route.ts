import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeFollowStatus, type FollowStatus } from "@/lib/leads";
import { actorName } from "@/lib/tenant";
import { emitOutboundEvent } from "@/lib/events";

export const dynamic = "force-dynamic";

const NOTE_MAX = 1000;
const DEAL_MAX = 1e12; // 成交额上限(1万亿元)，防极端值在 ×100 时溢出/脏数据
const ACTOR = actorName; // 当前单一共享登录，无 per-user 身份

const roundMoney = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const dealAuditText = (v: number | null): string => (v == null ? "成交额：清空" : `成交额：¥${v.toFixed(2)}`);

// PATCH /api/leads/[id] —— 更新跟进状态 / 备注 / 成交额；读-改-写在事务内完成，
// 仅在「真有变更」时落库并写一条审计日志(同次操作合并为一条)。
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "请求体格式错误" }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;

  let nextStatus: FollowStatus | undefined;
  let statusProvided = false;
  if ("followStatus" in payload) {
    const status = normalizeFollowStatus(String(payload.followStatus ?? ""));
    if (!status) return NextResponse.json({ error: "跟进状态非法" }, { status: 400 });
    nextStatus = status;
    statusProvided = true;
  }

  let nextNote: string | null | undefined;
  let noteProvided = false;
  if ("followNote" in payload) {
    if (payload.followNote !== null && typeof payload.followNote !== "string") {
      return NextResponse.json({ error: "备注格式错误" }, { status: 400 });
    }
    const trimmed = typeof payload.followNote === "string" ? payload.followNote.trim() : "";
    nextNote = trimmed ? trimmed.slice(0, NOTE_MAX) : null;
    noteProvided = true;
  }

  let nextDeal: number | null | undefined;
  let dealProvided = false;
  if ("dealValue" in payload) {
    if (payload.dealValue === null) {
      nextDeal = null;
    } else if (typeof payload.dealValue !== "number" || !Number.isFinite(payload.dealValue) || payload.dealValue < 0 || payload.dealValue > DEAL_MAX) {
      return NextResponse.json({ error: "成交金额非法" }, { status: 400 });
    } else {
      nextDeal = roundMoney(payload.dealValue);
    }
    dealProvided = true;
  }

  let nextAssignedTo: string | null | undefined;
  let assignedProvided = false;
  if ("assignedTo" in payload) {
    if (payload.assignedTo !== null && typeof payload.assignedTo !== "string") {
      return NextResponse.json({ error: "负责人格式错误" }, { status: 400 });
    }
    const trimmed = typeof payload.assignedTo === "string" ? payload.assignedTo.trim() : "";
    nextAssignedTo = trimmed ? trimmed.slice(0, 50) : null;
    assignedProvided = true;
  }

  let nextFollowAt: Date | null | undefined;
  let nextFollowProvided = false;
  if ("nextFollowAt" in payload) {
    if (payload.nextFollowAt === null || payload.nextFollowAt === "") {
      nextFollowAt = null;
    } else if (typeof payload.nextFollowAt === "string") {
      const d = new Date(payload.nextFollowAt);
      if (!Number.isFinite(d.getTime())) return NextResponse.json({ error: "下次跟进时间非法" }, { status: 400 });
      nextFollowAt = d;
    } else {
      return NextResponse.json({ error: "下次跟进时间格式错误" }, { status: 400 });
    }
    nextFollowProvided = true;
  }

  let nextFollowResult: string | null | undefined;
  let followResultProvided = false;
  if ("followResult" in payload) {
    if (payload.followResult !== null && typeof payload.followResult !== "string") {
      return NextResponse.json({ error: "跟进结果格式错误" }, { status: 400 });
    }
    const trimmed = typeof payload.followResult === "string" ? payload.followResult.trim() : "";
    nextFollowResult = trimmed ? trimmed.slice(0, 50) : null;
    followResultProvided = true;
  }

  if (!statusProvided && !noteProvided && !dealProvided && !assignedProvided && !nextFollowProvided && !followResultProvided) {
    return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    const current = await tx.recipient.findUnique({
      where: { id: params.id },
      select: { tenantId: true, mobile: true, followStatus: true, followNote: true, dealValue: true, assignedTo: true, nextFollowAt: true, followResult: true },
    });
    if (!current) return { notFound: true as const };

    const statusChanged = statusProvided && nextStatus !== current.followStatus;
    const noteChanged = noteProvided && (nextNote ?? null) !== (current.followNote ?? null);
    const dealChanged = dealProvided && (nextDeal ?? null) !== (current.dealValue ?? null);
    const assignedChanged = assignedProvided && (nextAssignedTo ?? null) !== (current.assignedTo ?? null);
    const nextFollowChanged = nextFollowProvided && (nextFollowAt?.toISOString() ?? null) !== (current.nextFollowAt?.toISOString() ?? null);
    const followResultChanged = followResultProvided && (nextFollowResult ?? null) !== (current.followResult ?? null);
    if (!statusChanged && !noteChanged && !dealChanged && !assignedChanged && !nextFollowChanged && !followResultChanged) {
      return { unchanged: true as const };
    }

    const data: {
      followStatus?: FollowStatus;
      followNote?: string | null;
      dealValue?: number | null;
      assignedTo?: string | null;
      nextFollowAt?: Date | null;
      followResult?: string | null;
      followedAt: Date;
    } = {
      followedAt: new Date(),
    };
    if (statusChanged) data.followStatus = nextStatus;
    if (noteChanged) data.followNote = nextNote ?? null;
    if (dealChanged) data.dealValue = nextDeal ?? null;
    if (assignedChanged) data.assignedTo = nextAssignedTo ?? null;
    if (nextFollowChanged) data.nextFollowAt = nextFollowAt ?? null;
    if (followResultChanged) data.followResult = nextFollowResult ?? null;

    const lead = await tx.recipient.update({
      where: { id: params.id },
      data,
      select: { id: true, tenantId: true, mobile: true, followStatus: true, followNote: true, dealValue: true, assignedTo: true, nextFollowAt: true, followResult: true, followedAt: true },
    });

    // 审计摘要：备注变更 + 成交额变更合并为一条多行 note
    const summary: string[] = [];
    if (noteChanged) summary.push(nextNote ? `备注：${nextNote}` : "备注：清空");
    if (dealChanged) summary.push(dealAuditText(nextDeal ?? null));
    if (assignedChanged) summary.push(nextAssignedTo ? `负责人：${nextAssignedTo}` : "负责人：清空");
    if (nextFollowChanged) summary.push(nextFollowAt ? `下次跟进：${nextFollowAt.toLocaleString("zh-CN")}` : "下次跟进：清空");
    if (followResultChanged) summary.push(nextFollowResult ? `跟进结果：${nextFollowResult}` : "跟进结果：清空");

    await tx.followLog.create({
      data: {
        tenantId: current.tenantId,
        recipientId: params.id,
        fromStatus: statusChanged ? current.followStatus : null,
        toStatus: statusChanged ? lead.followStatus : null,
        note: summary.length > 0 ? summary.join("\n") : null,
        actor: ACTOR(),
      },
    });
    return { lead };
  });

  if ("notFound" in result) return NextResponse.json({ error: "线索不存在" }, { status: 404 });
  if ("unchanged" in result) return NextResponse.json({ ok: true, unchanged: true });
  if (result.lead.followStatus === "won") {
    await emitOutboundEvent("lead.won", { recipientId: result.lead.id, mobile: result.lead.mobile, dealValue: result.lead.dealValue }, result.lead.tenantId);
  }
  return NextResponse.json({ ok: true, lead: result.lead });
}
