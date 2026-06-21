import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processCampaign } from "@/lib/tasks";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign?.autoRollout) return NextResponse.json({ error: "非自动放量任务" }, { status: 400 });
  if (campaign.rolledOut) return NextResponse.json({ error: "已放量" }, { status: 400 });

  // 测试阶段须全部发送完成
  const testPending = await db.recipient.count({ where: { campaignId: id, phase: "test", sendStatus: "pending" } });
  if (testPending > 0) return NextResponse.json({ error: "测试阶段尚未发送完成" }, { status: 400 });

  // 选赢家：测试阶段点击率最高（并列取已发送多者）
  const variants = await db.campaignVariant.findMany({ where: { campaignId: id } });
  const scored = await Promise.all(variants.map(async (v) => {
    const [sent, visited] = await Promise.all([
      db.recipient.count({ where: { campaignId: id, variantId: v.id, phase: "test", sendStatus: "sent" } }),
      db.recipient.count({ where: { campaignId: id, variantId: v.id, phase: "test", visited: true } }),
    ]);
    return { id: v.id, label: v.label, sent, ctr: sent ? visited / sent : 0 };
  }));
  const winner = scored.sort((a, b) => b.ctr - a.ctr || b.sent - a.sent)[0];
  if (!winner) return NextResponse.json({ error: "无可用变体" }, { status: 400 });

  // 剩余放量名单全部投赢家变体
  const rolled = await db.recipient.updateMany({
    where: { campaignId: id, phase: "rollout", sendStatus: "pending" },
    data: { variantId: winner.id },
  });
  await db.campaign.update({ where: { id }, data: { rolledOut: true } });
  processCampaign(id, "rollout").catch((e) => console.error("rollout error", e));

  return NextResponse.json({ ok: true, winner: winner.label, rolledCount: rolled.count });
}
