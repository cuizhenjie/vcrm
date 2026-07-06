// ROI 归因：营收(成交额合计) / 成本(发送条数×单价) / 利润 / ROI / ROAS / 客单价 / CAC
// 内部计算用整数分（避免浮点精度问题），输出时转元（2位小数）。
import { db } from "./db";
import type { Prisma } from "@prisma/client";
import { currentTenantId } from "./tenant";
import { smsUnitCostFen } from "./billing";

const CAMPAIGN_POOL = 50; // 仅对最近 N 个活动算 ROI 排行，与现有看板口径一致

export interface OrgRoi {
  unitCost: number; // 元（展示用）
  revenue: number; // 元
  cost: number; // 元
  profit: number; // 元
  roi: number | null; // 利润/成本，成本为0时 null
  roas: number | null; // 营收/成本
  wonCount: number;
  avgDeal: number | null; // 客单价（元）
  cac: number | null; // 获客成本=成本/成交数（元）
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

/** 整数分 → 元（2位小数，展示用） */
const fenToYuan = (fen: number): number => Math.round(fen) / 100;
const ratio = (num: number, den: number): number | null => (den > 0 ? num / den : null);

/** 从 env 解析短信单价（元）；内部转分用。保持原签名兼容。 */
export function smsUnitCost(raw: string | undefined = process.env.SMS_UNIT_COST): number {
  return fenToYuan(smsUnitCostFen(raw));
}

// 核心：在给定 scope(全量/单活动)下算 ROI。整数分计算，避免浮点精度。
export async function computeRoi(scope: Prisma.RecipientWhereInput = {}): Promise<OrgRoi> {
  const unitCostFen = smsUnitCostFen(); // 整数分
  const whereWith = (extra: Prisma.RecipientWhereInput): Prisma.RecipientWhereInput => ({ AND: [scope, extra] });
  const [totalSent, revenueAgg, wonCount] = await Promise.all([
    db.recipient.count({ where: whereWith({ sendStatus: "sent" }) }),
    db.recipient.aggregate({ where: whereWith({ followStatus: "won" }), _sum: { dealValue: true } }),
    db.recipient.count({ where: whereWith({ followStatus: "won" }) }),
  ]);

  // 整数分计算（dealValue 是元*100 存储？不——dealValue 是元 Float。
  // 这里 revenue 用 dealValue（元），转为分：Math.round(dealValue*100)
  const revenueFen = Math.round((revenueAgg._sum.dealValue ?? 0) * 100);
  const costFen = totalSent * unitCostFen;
  const profitFen = revenueFen - costFen;

  return {
    unitCost: fenToYuan(unitCostFen),
    revenue: fenToYuan(revenueFen),
    cost: fenToYuan(costFen),
    profit: fenToYuan(profitFen),
    roi: ratio(profitFen, costFen),
    roas: ratio(revenueFen, costFen),
    wonCount,
    avgDeal: wonCount ? fenToYuan(Math.round(revenueFen / wonCount)) : null,
    cac: wonCount ? fenToYuan(Math.round(costFen / wonCount)) : null,
  };
}

export function orgRoi(): Promise<OrgRoi> {
  return computeRoi({ tenantId: currentTenantId() });
}

export function campaignRoiOne(campaignId: string): Promise<OrgRoi> {
  return computeRoi({ tenantId: currentTenantId(), campaignId });
}

/** 活动维度 ROI 排行：用 groupBy 一次性聚合 sent/visited/won，避免 N+1 */
export async function campaignRoi(limit = 8): Promise<CampaignRoi[]> {
  const unitCostFen = smsUnitCostFen();
  const campaigns = await db.campaign.findMany({
    where: { tenantId: currentTenantId() },
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
      // 整数分计算
      const revenueFen = Math.round((won?._sum.dealValue ?? 0) * 100);
      const costFen = sent * unitCostFen;
      const profitFen = revenueFen - costFen;
      return {
        id: c.id,
        name: c.name,
        sent,
        visited,
        ctr: sent ? visited / sent : 0,
        wonCount: won?._count._all ?? 0,
        revenue: fenToYuan(revenueFen),
        cost: fenToYuan(costFen),
        profit: fenToYuan(profitFen),
        roi: ratio(profitFen, costFen),
      };
    })
    .filter((r) => r.sent > 0 || r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue || b.ctr - a.ctr || b.sent - a.sent)
    .slice(0, limit);
}
