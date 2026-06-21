import { db } from "./db";
import type { Prisma } from "@prisma/client";

// 三档响应人群：热(有意向) / 温(点击过) / 冷(已触达未点击)
export const AUDIENCES: Record<string, { label: string; desc: string; where: Prisma.RecipientWhereInput }> = {
  intent:               { label: "有意向客户",   desc: "回复命中意向，最热，应推转化", where: { intentTag: "有意向" } },
  clicked:              { label: "点击过链接",   desc: "点了短链但未表态，温热可催", where: { visited: true } },
  delivered_not_clicked:{ label: "已触达未点击", desc: "送达但没点，换文案再唤醒",   where: { sendStatus: "sent", visited: false } },
};

export async function retargetCustomerIds(fromCampaignId: string, audience: string): Promise<string[]> {
  const a = AUDIENCES[audience];
  if (!a) return [];
  const rs = await db.recipient.findMany({
    where: { campaignId: fromCampaignId, customerId: { not: null }, ...a.where },
    select: { customerId: true },
  });
  return [...new Set(rs.map((r) => r.customerId!).filter(Boolean))];
}

export async function audienceCounts(fromCampaignId: string) {
  const entries = await Promise.all(Object.entries(AUDIENCES).map(async ([key, a]) => {
    const ids = await db.recipient.findMany({
      where: { campaignId: fromCampaignId, customerId: { not: null }, ...a.where }, select: { customerId: true },
    });
    return [key, { label: a.label, desc: a.desc, count: new Set(ids.map((r) => r.customerId)).size }];
  }));
  return Object.fromEntries(entries) as Record<string, { label: string; desc: string; count: number }>;
}
