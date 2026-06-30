// 组织级转化漏斗：发送 → 送达 → 点击 → 意向 → 成交
// 口径=「触及的最深档」：更深的信号同时计入所有更浅档(回复即代表已触及，
// 成交即代表有意向)。由此保证逐档单调递减(环比≤100%)，且在缺送达回执时优雅降级。
import { db } from "./db";
import type { Prisma } from "@prisma/client";

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  stepRate: number; // 环比上一档
  totalRate: number; // 占发送
}

const SENT: Prisma.RecipientWhereInput = { sendStatus: "sent" };
const WON: Prisma.RecipientWhereInput = { followStatus: "won" };
const INTENT_OR_DEEPER: Prisma.RecipientWhereInput[] = [{ intentTag: "有意向" }, WON];
const CLICK_OR_DEEPER: Prisma.RecipientWhereInput[] = [{ visited: true }, ...INTENT_OR_DEEPER];
// 送达档：任何上行回复(含无意向/未表态)都证明已触及，叠加送达回执/点击/更深信号
const DELIVERED_OR_DEEPER: Prisma.RecipientWhereInput[] = [
  { deliveryStatus: "delivered" },
  { intentTag: { not: null } },
  ...CLICK_OR_DEEPER,
];

// campaignId 存在 → 仅该活动；否则组织级全量(行为与之前完全一致)
export async function conversionFunnel(campaignId?: string): Promise<FunnelStage[]> {
  const scope: Prisma.RecipientWhereInput = campaignId ? { campaignId } : {};
  const scoped = (...parts: Prisma.RecipientWhereInput[]): Prisma.RecipientWhereInput => ({ AND: [scope, SENT, ...parts] });

  const [sent, delivered, clicked, intent, won] = await Promise.all([
    db.recipient.count({ where: scoped() }),
    db.recipient.count({ where: scoped({ OR: DELIVERED_OR_DEEPER }) }),
    db.recipient.count({ where: scoped({ OR: CLICK_OR_DEEPER }) }),
    db.recipient.count({ where: scoped({ OR: INTENT_OR_DEEPER }) }),
    db.recipient.count({ where: scoped(WON) }),
  ]);

  const raw = [
    { key: "sent", label: "发送", count: sent },
    { key: "delivered", label: "送达", count: delivered },
    { key: "clicked", label: "点击", count: clicked },
    { key: "intent", label: "意向", count: intent },
    { key: "won", label: "成交", count: won },
  ];

  return raw.map((stage, i) => {
    const prev = i === 0 ? stage.count : raw[i - 1].count;
    return {
      ...stage,
      stepRate: i === 0 ? 1 : prev ? stage.count / prev : 0,
      totalRate: sent ? stage.count / sent : 0,
    };
  });
}
