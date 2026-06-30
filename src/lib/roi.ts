// ROI 归因：营收(成交额合计) / 成本(发送条数×单价) / 利润 / ROI / ROAS / 客单价 / CAC
// 金额用元(Float)，在边界 round 到 2 位；生产财务级建议整数分或 Decimal。
import { db } from "./db";
import type { Prisma } from "@prisma/client";

const DEFAULT_UNIT_COST = 0.05;
const CAMPAIGN_POOL = 50; // 仅对最近 N 个活动算 ROI 排行，与现有看板口径一致

export interface OrgRoi {
  unitCost: number;
  revenue: number;
  cost: number;
  profit: number;
  roi: number | null; // 利润/成本，成本为0时 null
  roas: number | null; // 营收/成本
  wonCount: number;
  avgDeal: number | null; // 客单价
  cac: number | null; // 获客成本=成本/成交数
}

export interface CampaignRoi {
  id: string;
  name: string;
  sent: number;
  visited: number;
  ctr: number;
  wonCount: number;
  revenue: number;
  cost: number;
  profit: number;
  roi: number | null;
}

const roundMoney = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** 从 env 安全解析短信单价；非法/负/NaN/Infinity → 默认值；允许显式 0 */
export function smsUnitCost(raw: string | undefined = process.env.SMS_UNIT_COST): number {
  const text = raw?.trim();
  if (!text) return DEFAULT_UNIT_COST;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_UNIT_COST;
}

// 核心：在给定 scope(全量/单活动)下算 ROI。orgRoi/campaignRoiOne 都走这里，数值口径一致。
export async function computeRoi(scope: Prisma.RecipientWhereInput = {}): Promise<OrgRoi> {
  const unitCost = smsUnitCost();
  const whereWith = (extra: Prisma.RecipientWhereInput): Prisma.RecipientWhereInput => ({ AND: [scope, extra] });
  const [totalSent, revenueAgg, wonCount] = await Promise.all([
    db.recipient.count({ where: whereWith({ sendStatus: "sent" }) }),
    db.recipient.aggregate({ where: whereWith({ followStatus: "won" }), _sum: { dealValue: true } }),
    db.recipient.count({ where: whereWith({ followStatus: "won" }) }),
  ]);

  const revenue = roundMoney(revenueAgg._sum.dealValue ?? 0);
  const cost = roundMoney(totalSent * unitCost);
  const profit = roundMoney(revenue - cost);
  return {
    unitCost,
    revenue,
    cost,
    profit,
    roi: ratio(profit, cost),
    roas: ratio(revenue, cost),
    wonCount,
    avgDeal: wonCount ? roundMoney(revenue / wonCount) : null,
    cac: wonCount ? roundMoney(cost / wonCount) : null,
  };
}

export function orgRoi(): Promise<OrgRoi> {
  return computeRoi({});
}

export function campaignRoiOne(campaignId: string): Promise<OrgRoi> {
  return computeRoi({ campaignId });
}

/** 活动维度 ROI 排行：用 groupBy 一次性聚合 sent/visited/won，避免 N+1 */
export async function campaignRoi(limit = 8): Promise<CampaignRoi[]> {
  const unitCost = smsUnitCost();
  const campaigns = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    take: CAMPAIGN_POOL,
    select: { id: true, name: true },
  });
  const ids = campaigns.map((c) => c.id);
  if (ids.length === 0) return [];

  const [sentGroups, visitedGroups, wonGroups] = await Promise.all([
    db.recipient.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, sendStatus: "sent" }, _count: { _all: true } }),
    db.recipient.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, visited: true }, _count: { _all: true } }),
    db.recipient.groupBy({ by: ["campaignId"], where: { campaignId: { in: ids }, followStatus: "won" }, _sum: { dealValue: true }, _count: { _all: true } }),
  ]);
  const sentMap = new Map(sentGroups.map((g) => [g.campaignId, g._count._all]));
  const visitedMap = new Map(visitedGroups.map((g) => [g.campaignId, g._count._all]));
  const wonMap = new Map(wonGroups.map((g) => [g.campaignId, g]));

  return campaigns
    .map((c) => {
      const sent = sentMap.get(c.id) ?? 0;
      const visited = visitedMap.get(c.id) ?? 0;
      const won = wonMap.get(c.id);
      const revenue = roundMoney(won?._sum.dealValue ?? 0);
      const cost = roundMoney(sent * unitCost);
      return {
        id: c.id,
        name: c.name,
        sent,
        visited,
        ctr: sent ? visited / sent : 0,
        wonCount: won?._count._all ?? 0,
        revenue,
        cost,
        profit: roundMoney(revenue - cost),
        roi: ratio(roundMoney(revenue - cost), cost),
      };
    })
    .filter((r) => r.sent > 0 || r.revenue > 0)
    // 优先按营收排，无成交数据时回退到点击率/发送量，保持排行有意义
    .sort((a, b) => b.revenue - a.revenue || b.ctr - a.ctr || b.sent - a.sent)
    .slice(0, limit);
}
