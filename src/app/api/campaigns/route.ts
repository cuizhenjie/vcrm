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
  const { name, type, templateId, batchId } = await req.json();
  if (!name) return NextResponse.json({ error: "任务名称必填" }, { status: 400 });

  const customers = await db.customer.findMany({
    where: { isBlacklist: false, ...(batchId ? { batchId } : {}) },
  });
  if (customers.length === 0) return NextResponse.json({ error: "无有效客户" }, { status: 400 });

  const campaign = await db.campaign.create({
    data: { name, type: type ?? "text_sms", templateId: templateId ?? null,
            status: "pending", total: customers.length, valid: customers.length },
  });
  await db.recipient.createMany({
    data: customers.map((c) => ({
      campaignId: campaign.id, customerId: c.id, mobile: c.mobile,
      // extno 由数据库默认 cuid 自动生成，保证全局唯一（回执/上行回填靠它）
    })),
  });
  return NextResponse.json(campaign);
}
