// 线索池仓储层：线索 = 有 intentTag(上行命中意图) 的 Recipient
// 关联客户名 / 来源活动名 / 最新一条上行回复原文，供销售消费转化
import { db } from "./db";
import type { Prisma } from "@prisma/client";

export const FOLLOW_STATUSES = ["new", "following", "won", "lost"] as const;
export type FollowStatus = (typeof FOLLOW_STATUSES)[number];

export const FOLLOW_LABELS: Record<FollowStatus, string> = {
  new: "待跟进",
  following: "跟进中",
  won: "已成交",
  lost: "已流失",
};

export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;
export const EXPORT_LIMIT = 10000;

// SQLite 单条 SQL 变量上限约 999，IN 列表按此分块避免超限
const IN_CHUNK = 400;
// 关键词命中回复时最多回溯的条数。命中的 recipientId 会塞进单条 `id IN (...)`，
// 必须 < SQLite 变量上限(~999)，否则查询直接报错；超量按 best-effort 截断。
const REPLY_MATCH_LIMIT = 500;

// 意图筛选别名 → 落库的中文标签（webhook 写入「有意向/无意向/未表态」）
const INTENT_ALIAS: Record<string, string> = {
  positive: "有意向",
  negative: "无意向",
  default: "未表态",
  有意向: "有意向",
  无意向: "无意向",
  未表态: "未表态",
};

export interface LeadFilters {
  intent?: string | null;
  status?: string | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
}

export interface LeadReply {
  content: string;
  matchedAttr: string | null;
  receivedAt: string;
}

export interface LeadItem {
  id: string;
  campaignId: string;
  customerId: string | null;
  mobile: string;
  customerName: string | null;
  campaignName: string;
  intentTag: string;
  followStatus: FollowStatus;
  dealValue: number | null;
  followNote: string | null;
  followedAt: string | null;
  visited: boolean;
  sendStatus: string;
  createdAt: string;
  latestReply: LeadReply | null;
}

export interface LeadCounts {
  total: number;
  byStatus: Record<FollowStatus, number>;
  byIntent: { positive: number; negative: number; neutral: number };
}

type RecipientRow = Prisma.RecipientGetPayload<{
  include: {
    customer: { select: { name: true } };
    campaign: { select: { name: true } };
  };
}>;

/** 把任意输入归一为合法跟进状态；非法/空/all → undefined（不过滤） */
export function normalizeFollowStatus(input?: string | null): FollowStatus | undefined {
  const raw = input?.trim();
  if (!raw || raw === "all") return undefined;
  return (FOLLOW_STATUSES as readonly string[]).includes(raw) ? (raw as FollowStatus) : undefined;
}

/** 把意图别名归一为落库标签；空/all/未知 → undefined（不过滤） */
export function normalizeIntent(input?: string | null): string | undefined {
  const raw = input?.trim();
  if (!raw || raw === "all") return undefined;
  return INTENT_ALIAS[raw];
}

/** 关键词命中上行回复正文 → 对应 recipientId 列表 */
async function recipientIdsByReply(q: string): Promise<string[]> {
  const rows = await db.moMessage.findMany({
    where: { recipientId: { not: null }, content: { contains: q } },
    select: { recipientId: true },
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: REPLY_MATCH_LIMIT,
  });
  return [...new Set(rows.map((r) => r.recipientId).filter((id): id is string => Boolean(id)))];
}

/** 组装线索查询条件（关键词跨客户名/手机/活动/备注/回复正文） */
async function buildWhere(filters: LeadFilters): Promise<Prisma.RecipientWhereInput> {
  const and: Prisma.RecipientWhereInput[] = [{ intentTag: { not: null } }, { intentTag: { not: "" } }];

  const intent = normalizeIntent(filters.intent);
  if (intent) and.push({ intentTag: intent });

  const status = normalizeFollowStatus(filters.status);
  if (status) and.push({ followStatus: status });

  const q = filters.q?.trim();
  if (q) {
    const replyIds = await recipientIdsByReply(q);
    const or: Prisma.RecipientWhereInput[] = [
      { mobile: { contains: q } },
      { followNote: { contains: q } },
      { customer: { is: { name: { contains: q } } } },
      { campaign: { is: { name: { contains: q } } } },
    ];
    if (replyIds.length > 0) or.push({ id: { in: replyIds } });
    and.push({ OR: or });
  }
  return { AND: and };
}

/** 批量取每个 recipient 的最新一条回复（按 IN 分块，规避 SQLite 变量上限） */
async function latestReplies(ids: string[]): Promise<Map<string, LeadReply>> {
  const latest = new Map<string, LeadReply>();
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    const chunk = ids.slice(i, i + IN_CHUNK);
    const rows = await db.moMessage.findMany({
      where: { recipientId: { in: chunk } },
      select: { recipientId: true, content: true, matchedAttr: true, receivedAt: true },
      orderBy: [{ receivedAt: "desc" }, { id: "desc" }], // 同秒多条回复时排序稳定
    });
    for (const r of rows) {
      if (r.recipientId && !latest.has(r.recipientId)) {
        latest.set(r.recipientId, {
          content: r.content,
          matchedAttr: r.matchedAttr,
          receivedAt: r.receivedAt.toISOString(),
        });
      }
    }
  }
  return latest;
}

function toLeadItem(row: RecipientRow, replies: Map<string, LeadReply>): LeadItem {
  return {
    id: row.id,
    campaignId: row.campaignId,
    customerId: row.customerId,
    mobile: row.mobile,
    customerName: row.customer?.name ?? null,
    campaignName: row.campaign.name,
    intentTag: row.intentTag ?? "",
    followStatus: normalizeFollowStatus(row.followStatus) ?? "new",
    dealValue: row.dealValue ?? null,
    followNote: row.followNote ?? null,
    followedAt: row.followedAt?.toISOString() ?? null,
    visited: row.visited,
    sendStatus: row.sendStatus,
    createdAt: row.createdAt.toISOString(),
    latestReply: replies.get(row.id) ?? null,
  };
}

const leadInclude = {
  customer: { select: { name: true } },
  campaign: { select: { name: true } },
} satisfies Prisma.RecipientInclude;

/** 分页列出线索；count 与列表同一事务，避免分页数与列表不同步 */
export async function listLeads(filters: LeadFilters): Promise<{
  items: LeadItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const page = Math.max(1, Math.floor(Number(filters.page) || 1));
  const pageSize = Math.min(PAGE_SIZE_MAX, Math.max(1, Math.floor(Number(filters.pageSize) || PAGE_SIZE_DEFAULT)));
  const where = await buildWhere(filters);

  const [total, rows] = await db.$transaction([
    db.recipient.count({ where }),
    db.recipient.findMany({
      where,
      include: leadInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const replies = await latestReplies(rows.map((r) => r.id));
  return {
    items: rows.map((r) => toLeadItem(r, replies)),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** 导出用：按筛选取全量（封顶 EXPORT_LIMIT 条） */
export async function listLeadsForExport(filters: LeadFilters): Promise<LeadItem[]> {
  const where = await buildWhere(filters);
  const rows = await db.recipient.findMany({
    where,
    include: leadInclude,
    orderBy: { createdAt: "desc" },
    take: EXPORT_LIMIT,
  });
  const replies = await latestReplies(rows.map((r) => r.id));
  return rows.map((r) => toLeadItem(r, replies));
}

/** 线索池汇总：跟进状态分布 + 意图分布 */
export async function leadCounts(): Promise<LeadCounts> {
  const base = await buildWhere({});
  const withFilter = (extra: Prisma.RecipientWhereInput): Prisma.RecipientWhereInput => ({ AND: [base, extra] });
  const [total, newCount, following, won, lost, positive, negative, neutral] = await Promise.all([
    db.recipient.count({ where: base }),
    db.recipient.count({ where: withFilter({ followStatus: "new" }) }),
    db.recipient.count({ where: withFilter({ followStatus: "following" }) }),
    db.recipient.count({ where: withFilter({ followStatus: "won" }) }),
    db.recipient.count({ where: withFilter({ followStatus: "lost" }) }),
    db.recipient.count({ where: withFilter({ intentTag: "有意向" }) }),
    db.recipient.count({ where: withFilter({ intentTag: "无意向" }) }),
    db.recipient.count({ where: withFilter({ intentTag: "未表态" }) }),
  ]);
  return {
    total,
    byStatus: { new: newCount, following, won, lost },
    byIntent: { positive, negative, neutral },
  };
}
