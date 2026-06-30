import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { smsUnitCost } from "@/lib/roi";
export const dynamic = "force-dynamic";

/**
 * 导出活动明细 + ROI 归因列。
 * 收件人级 ROI 拆分：
 *   成本 = unitCost * 1（每条 recipient 短信成本 1 份）
 *   营收 = dealValue（仅 followStatus=won 的 recipient 计营收）
 *   ROI = (营收 - 成本) / 成本
 */
export async function GET(_: Request, { params }: { params: { id: string } }) {
  const c = await db.campaign.findUnique({ where: { id: params.id } });
  const recipients = await db.recipient.findMany({
    where: { campaignId: params.id },
    include: { variant: true },
    orderBy: { createdAt: "asc" },
  });

  const unitCost = smsUnitCost();

  // 活动级 ROI 汇总
  const totalSent = recipients.filter((r) => r.sendStatus === "sent").length;
  const totalWon = recipients.filter((r) => r.followStatus === "won").length;
  const totalRevenue = recipients.reduce((s, r) => s + (r.followStatus === "won" ? r.dealValue ?? 0 : 0), 0);
  const totalCost = totalSent * unitCost;
  const totalProfit = totalRevenue - totalCost;
  const totalRoi = totalCost > 0 ? totalProfit / totalCost : null;
  const totalRoas = totalCost > 0 ? totalRevenue / totalCost : null;

  const header = [
    "手机号", "发送状态", "送达", "短链点击", "意图标签",
    "A/B变体", "阶段", "流水号", "跟进状态", "成交金额(元)", "成本(元)", "单条ROI",
  ];
  const lines = recipients.map((r) => {
    const sent = r.sendStatus === "sent" ? 1 : 0;
    const won = r.followStatus === "won" ? 1 : 0;
    const revenue = won ? r.dealValue ?? 0 : 0;
    const cost = sent * unitCost;
    const profit = revenue - cost;
    const roi = cost > 0 ? (profit / cost).toFixed(4) : "";
    return [
      r.mobile,
      r.sendStatus,
      r.deliveryStatus ?? "",
      r.visited ? "是" : "否",
      r.intentTag ?? "",
      r.variant?.label ?? "",
      r.phase,
      r.extno,
      r.followStatus,
      revenue.toFixed(2),
      cost.toFixed(4),
      roi,
    ].join(",");
  });

  // 追加 1 行活动级 ROI 汇总
  const summary = [
    "",
    `# 活动级 ROI 汇总（unitCost=¥${unitCost.toFixed(4)}）`,
    `# 发送成功=${totalSent}, 成交=${totalWon}`,
    `# 营收=¥${totalRevenue.toFixed(2)}, 成本=¥${totalCost.toFixed(2)}, 利润=¥${totalProfit.toFixed(2)}`,
    `# ROI=${totalRoi == null ? "—" : (totalRoi * 100).toFixed(2) + "%"}, ROAS=${totalRoas == null ? "—" : totalRoas.toFixed(2) + "x"}`,
  ].join("\n");

  const csv = "\uFEFF" + [header.join(","), ...lines, summary].join("\n");
  const safe = `campaign-${params.id}.csv`;
  const pretty = encodeURIComponent(`${c?.name ?? "活动"}-明细.csv`);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${pretty}`,
    },
  });
}
