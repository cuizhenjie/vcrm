import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { normalizeFollowStatus, type FollowStatus } from "@/lib/leads";

export const dynamic = "force-dynamic";

const NOTE_MAX = 1000;
const DEAL_MAX = 1e12; // 成交额上限(1万亿元)，防极端值在 ×100 时溢出/脏数据
const ACTOR = "运营"; // 当前单一共享登录，无 per-user 身份

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

  if (!statusProvided && !noteProvided && !dealProvided) {
    return NextResponse.json({ error: "无可更新字段" }, { status: 400 });
  }

  const result = await db.$transaction(async (tx) => {
    const current = await tx.recipient.findUnique({
      where: { id: params.id },
      select: { followStatus: true, followNote: true, dealValue: true },
    });
    if (!current) return { notFound: true as const };

    const statusChanged = statusProvided && nextStatus !== current.followStatus;
    const noteChanged = noteProvided && (nextNote ?? null) !== (current.followNote ?? null);
    const dealChanged = dealProvided && (nextDeal ?? null) !== (current.dealValue ?? null);
    if (!statusChanged && !noteChanged && !dealChanged) {
      return { unchanged: true as const };
    }

    const data: { followStatus?: FollowStatus; followNote?: string | null; dealValue?: number | null; followedAt: Date } = {
      followedAt: new Date(),
    };
    if (statusChanged) data.followStatus = nextStatus;
    if (noteChanged) data.followNote = nextNote ?? null;
    if (dealChanged) data.dealValue = nextDeal ?? null;

    const lead = await tx.recipient.update({
      where: { id: params.id },
      data,
      select: { id: true, followStatus: true, followNote: true, dealValue: true, followedAt: true },
    });

    // 审计摘要：备注变更 + 成交额变更合并为一条多行 note
    const summary: string[] = [];
    if (noteChanged) summary.push(nextNote ? `备注：${nextNote}` : "备注：清空");
    if (dealChanged) summary.push(dealAuditText(nextDeal ?? null));

    await tx.followLog.create({
      data: {
        recipientId: params.id,
        fromStatus: statusChanged ? current.followStatus : null,
        toStatus: statusChanged ? lead.followStatus : null,
        note: summary.length > 0 ? summary.join("\n") : null,
        actor: ACTOR,
      },
    });
    return { lead };
  });

  if ("notFound" in result) return NextResponse.json({ error: "线索不存在" }, { status: 404 });
  if ("unchanged" in result) return NextResponse.json({ ok: true, unchanged: true });
  return NextResponse.json({ ok: true, lead: result.lead });
}
