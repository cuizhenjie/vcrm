// 跟进操作日志仓储层：读取线索时间线 / 全局最近动态，并提供统一序列化
import { db } from "./db";
import type { Prisma } from "@prisma/client";
import { currentTenantId } from "./tenant";

export const GLOBAL_FEED_LIMIT = 20;
export const TIMELINE_LIMIT = 100;

export interface FollowLogItem {
  id: string;
  recipientId: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actor: string;
  createdAt: string;
  recipient: { id: string; mobile: string; customerName: string | null; campaignName: string };
}

type FollowLogRow = Prisma.FollowLogGetPayload<{
  include: {
    recipient: {
      select: { id: true; mobile: true; customer: { select: { name: true } }; campaign: { select: { name: true } } };
    };
  };
}>;

const logInclude = {
  recipient: {
    select: { id: true, mobile: true, customer: { select: { name: true } }, campaign: { select: { name: true } } },
  },
} satisfies Prisma.FollowLogInclude;

export function serializeFollowLog(row: FollowLogRow): FollowLogItem {
  return {
    id: row.id,
    recipientId: row.recipientId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    note: row.note,
    actor: row.actor,
    createdAt: row.createdAt.toISOString(),
    recipient: {
      id: row.recipient.id,
      mobile: row.recipient.mobile,
      customerName: row.recipient.customer?.name ?? null,
      campaignName: row.recipient.campaign.name,
    },
  };
}

/** 有 recipientId → 该线索时间线(最多 TIMELINE_LIMIT)；否则 → 全局最近动态(GLOBAL_FEED_LIMIT) */
export async function listFollowLogs(recipientId?: string | null): Promise<FollowLogItem[]> {
  const id = recipientId?.trim();
  const tenantId = currentTenantId();
  const rows = await db.followLog.findMany({
    where: id ? { tenantId, recipientId: id } : { tenantId },
    orderBy: { createdAt: "desc" },
    take: id ? TIMELINE_LIMIT : GLOBAL_FEED_LIMIT,
    include: logInclude,
  });
  return rows.map(serializeFollowLog);
}
