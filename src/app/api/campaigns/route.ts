import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSegmentWhere } from "@/lib/segment";
import { retargetCustomerIds } from "@/lib/retarget";
import { currentTenantId } from "@/lib/tenant";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenantId = currentTenantId();
  const list = await db.campaign.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { recipients: true } } },
  });
  return NextResponse.json(list);
}

// 新建任务：body = { name, type, templateId, batchId? }  从有效客户生成 recipients
export async function POST(req: NextRequest) {
  const tenantId = currentTenantId();
  const { name, type, templateId, batchId, variants, autoRollout, testRatio, segment, scheduledAt, quietHours, source } = await req.json();
  if (!name) return NextResponse.json({ error: "任务名称必填" }, { status: 400 });

  let customers;
  if (source?.fromCampaignId && source?.audience) {
    const ids = await retargetCustomerIds(source.fromCampaignId, source.audience, tenantId);
    customers = await db.customer.findMany({ where: { tenantId, id: { in: ids }, isBlacklist: false } });
    if (customers.length === 0) return NextResponse.json({ error: "该再营销人群为空" }, { status: 400 });
  } else {
    const where = segment ? buildSegmentWhere({ ...segment, tenantId }) : { tenantId, isBlacklist: false, ...(batchId ? { batchId } : {}) };
    customers = await db.customer.findMany({ where });
    if (customers.length === 0) return NextResponse.json({ error: "该分群下无有效客户" }, { status: 400 });
  }

  const ratio = Math.min(90, Math.max(5, Number(testRatio) || 20));
  const when = scheduledAt ? new Date(scheduledAt) : null;
  const status = when && when.getTime() > Date.now() ? "scheduled" : "pending";
  const campaign = await db.campaign.create({
    data: { tenantId, name, type: type ?? "text_sms", templateId: templateId ?? null,
            status, scheduledAt: when, quietHours: quietHours !== false,
            total: customers.length, valid: customers.length,
            autoRollout: !!autoRollout, testRatio: ratio },
  });

  // A/B：若传入 variants，则创建变体并按权重把收件人分流到各变体
  let pool: string[] = [];
  if (Array.isArray(variants) && variants.length > 0) {
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const cv = await db.campaignVariant.create({
        data: { tenantId, campaignId: campaign.id, label: v.label ?? String.fromCharCode(65 + i),
                templateId: v.templateId ?? null, weight: Math.max(1, Number(v.weight) || 1) },
      });
      pool.push(...Array(cv.weight).fill(cv.id)); // 按权重展开
    }
  }
  const useRollout = !!autoRollout && pool.length > 0;
  const testCount = useRollout
    ? Math.max(variants.length, Math.ceil(customers.length * ratio / 100))
    : customers.length;
  await db.recipient.createMany({
    data: customers.map((c, i) => {
      const inTest = i < testCount;
      return {
        campaignId: campaign.id, customerId: c.id, mobile: c.mobile,
        tenantId,
        phase: useRollout ? (inTest ? "test" : "rollout") : "test",
        // 测试组按权重分流；放量组先留空，等赢家确定后再投
        variantId: pool.length ? (inTest ? pool[i % pool.length] : null) : null,
      };
    }),
  });
  return NextResponse.json(campaign);
}
