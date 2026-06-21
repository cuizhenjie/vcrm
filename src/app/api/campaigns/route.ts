import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const list = await db.campaign.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } },
  });
  return NextResponse.json(list);
}

// 新建任务：body = { name, type, templateId, batchId? }  从有效客户生成 recipients
export async function POST(req: NextRequest) {
  const { name, type, templateId, batchId, variants } = await req.json();
  if (!name) return NextResponse.json({ error: "任务名称必填" }, { status: 400 });

  const customers = await db.customer.findMany({
    where: { isBlacklist: false, ...(batchId ? { batchId } : {}) },
  });
  if (customers.length === 0) return NextResponse.json({ error: "无有效客户" }, { status: 400 });

  const campaign = await db.campaign.create({
    data: { name, type: type ?? "text_sms", templateId: templateId ?? null,
            status: "pending", total: customers.length, valid: customers.length },
  });

  // A/B：若传入 variants，则创建变体并按权重把收件人分流到各变体
  let pool: string[] = [];
  if (Array.isArray(variants) && variants.length > 0) {
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const cv = await db.campaignVariant.create({
        data: { campaignId: campaign.id, label: v.label ?? String.fromCharCode(65 + i),
                templateId: v.templateId ?? null, weight: Math.max(1, Number(v.weight) || 1) },
      });
      pool.push(...Array(cv.weight).fill(cv.id)); // 按权重展开
    }
  }
  await db.recipient.createMany({
    data: customers.map((c, i) => ({
      campaignId: campaign.id, customerId: c.id, mobile: c.mobile,
      variantId: pool.length ? pool[i % pool.length] : null,
      // extno 由数据库默认 cuid 自动生成，保证全局唯一（回执/上行回填靠它）
    })),
  });
  return NextResponse.json(campaign);
}
