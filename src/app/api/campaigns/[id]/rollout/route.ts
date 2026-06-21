import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processCampaign } from "@/lib/tasks";
import { abSignificance } from "@/lib/significance";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const id = params.id;
  const body = await req.json().catch(() => ({}));
  const force = !!body.force;
  const campaign = await db.campaign.findUnique({ where: { id } });
  if (!campaign?.autoRollout) return NextResponse.json({ error: "非自动放量任务" }, { status: 400 });
  if (campaign.rolledOut) return NextResponse.json({ error: "已放量" }, { status: 400 });

  // 测试阶段须全部发送完成
  const testPending = await db.recipient.count({ where: { campaignId: id, phase: "test", sendStatus: "pending" } });
  if (testPending > 0) return NextResponse.json({ error: "测试阶段尚未发送完成" }, { status: 400 });

  // 选赢家：测试阶段 CTR + 统计显著性检验
  const variants = await db.campaignVariant.findMany({ where: { campaignId: id } });
  const scored = await Promise.all(variants.map(async (v) => {
    const [sent, visited] = await Promise.all([
      db.recipient.count({ where: { campaignId: id, variantId: v.id, phase: "test", sendStatus: "sent" } }),
      db.recipient.count({ where: { campaignId: id, variantId: v.id, phase: "test", visited: true } }),
    ]);
    return { id: v.id, label: v.label, sent, visited };
  }));
  const sig = abSignificance(scored);
  const winner = sig.winner;
  if (!winner) return NextResponse.json({ error: "无可用变体" }, { status: 400 });

  // 显著性闸门：不显著且未强制 → 拦截，避免把整批名单投给“假赢家”
  if (!sig.significant && !force) {
    return NextResponse.json({ error: "差异未达统计显著", reason: sig.reason, confidence: sig.confidence, canForce: true }, { status: 409 });
  }

  // 剩余放量名单全部投赢家变体
  const rolled = await db.recipient.updateMany({
    where: { campaignId: id, phase: "rollout", sendStatus: "pending" },
    data: { variantId: winner.id },
  });
  await db.campaign.update({ where: { id }, data: { rolledOut: true } });
  processCampaign(id, "rollout").catch((e) => console.error("rollout error", e));

  return NextResponse.json({ ok: true, winner: winner.label, rolledCount: rolled.count, confidence: sig.confidence, forced: force && !sig.significant });
}
