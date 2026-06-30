import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { abSignificance } from "@/lib/significance";
import { audienceCounts } from "@/lib/retarget";
import { conversionFunnel } from "@/lib/funnel";
import { campaignRoiOne } from "@/lib/roi";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const campaign = await db.campaign.findUnique({
    where: { id: params.id },
    include: { template: true, recipients: { take: 100, orderBy: { createdAt: "desc" } } },
  });
  if (!campaign) return NextResponse.json({ error: "not found" }, { status: 404 });

  const [sent, failed, filtered, visited, delivered, funnel, roi] = await Promise.all([
    db.recipient.count({ where: { campaignId: params.id, sendStatus: "sent" } }),
    db.recipient.count({ where: { campaignId: params.id, sendStatus: "failed" } }),
    db.recipient.count({ where: { campaignId: params.id, sendStatus: "filtered" } }),
    db.recipient.count({ where: { campaignId: params.id, visited: true } }),
    db.recipient.count({ where: { campaignId: params.id, deliveryStatus: "delivered" } }),
    conversionFunnel(params.id),
    campaignRoiOne(params.id),
  ]);
  // A/B 各变体表现：点击率 = 点击/发送，标出领先者
  const variants = await db.campaignVariant.findMany({ where: { campaignId: params.id }, include: { template: true } });
  const variantStats = await Promise.all(variants.map(async (v) => {
    const [vsent, vvisited] = await Promise.all([
      db.recipient.count({ where: { campaignId: params.id, variantId: v.id, sendStatus: "sent" } }),
      db.recipient.count({ where: { campaignId: params.id, variantId: v.id, visited: true } }),
    ]);
    return { id: v.id, label: v.label, template: v.template?.name ?? "—", sent: vsent, visited: vvisited, ctr: vsent ? vvisited / vsent : 0 };
  }));
  const best = variantStats.filter((v) => v.sent > 0).sort((a, b) => b.ctr - a.ctr)[0];
  const winnerId = best && best.ctr > 0 ? best.id : null;

  // 自动放量进度
  let rollout: any = null;
  if (campaign.autoRollout) {
    const [testTotal, testSent, rolloutTotal] = await Promise.all([
      db.recipient.count({ where: { campaignId: params.id, phase: "test" } }),
      db.recipient.count({ where: { campaignId: params.id, phase: "test", sendStatus: "sent" } }),
      db.recipient.count({ where: { campaignId: params.id, phase: "rollout" } }),
    ]);
    const testPending = await db.recipient.count({ where: { campaignId: params.id, phase: "test", sendStatus: "pending" } });
    // 显著性基于「测试阶段」各变体表现
    const tScores = await Promise.all((await db.campaignVariant.findMany({ where: { campaignId: params.id } })).map(async (v) => {
      const [vs, vv] = await Promise.all([
        db.recipient.count({ where: { campaignId: params.id, variantId: v.id, phase: "test", sendStatus: "sent" } }),
        db.recipient.count({ where: { campaignId: params.id, variantId: v.id, phase: "test", visited: true } }),
      ]);
      return { id: v.id, label: v.label, sent: vs, visited: vv };
    }));
    const sig = abSignificance(tScores);
    rollout = { testTotal, testSent, rolloutTotal,
      canRollout: testTotal > 0 && testPending === 0 && rolloutTotal > 0 && !campaign.rolledOut,
      winnerLabel: sig.winner?.label,
      significant: sig.significant, confidence: sig.confidence, reason: sig.reason, minSample: sig.minSample };
  }

  const audiences = await audienceCounts(params.id);
  return NextResponse.json({ campaign, intent, funnel, roi, variantStats, winnerId, rollout, audiences, stats: { sent, failed, filtered, visited, delivered, total: campaign.total } });
}
