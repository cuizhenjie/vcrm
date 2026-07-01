import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

const DEFAULT_TENANT_ID = "default_tenant";

async function main() {
  await db.tenant.upsert({
    where: { id: DEFAULT_TENANT_ID },
    update: { name: "默认租户", status: "active" },
    create: { id: DEFAULT_TENANT_ID, slug: "default", name: "默认租户", status: "active" },
  });
  const plan = await db.plan.upsert({
    where: { code: "starter" },
    update: { name: "Starter", smsIncluded: 10000, unitPriceFen: 5, maxUsers: 3 },
    create: { code: "starter", name: "Starter", smsIncluded: 10000, unitPriceFen: 5, maxUsers: 3 },
  });
  const hasSubscription = await db.subscription.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  if (!hasSubscription) {
    await db.subscription.create({
      data: { tenantId: DEFAULT_TENANT_ID, planId: plan.id, status: "trialing" },
    });
  }
  await db.appUser.upsert({
    where: { tenantId_email: { tenantId: DEFAULT_TENANT_ID, email: "admin@vcrm.local" } },
    update: { name: "运营管理员", role: "owner", status: "active" },
    create: { tenantId: DEFAULT_TENANT_ID, email: "admin@vcrm.local", name: "运营管理员", role: "owner" },
  });
  const hasSeedGrant = await db.creditLedger.count({
    where: { tenantId: DEFAULT_TENANT_ID, reason: "seed_grant" },
  });
  if (!hasSeedGrant) {
    await db.creditLedger.create({
      data: { tenantId: DEFAULT_TENANT_ID, delta: 10000, balanceAfter: 10000, reason: "seed_grant" },
    });
  }

  await db.smsTemplate.createMany({
    data: [
      { tenantId: DEFAULT_TENANT_ID, name: "续费提醒-千人千面", type: "text", reportStatus: "approved",
        content: "尊敬的{name}，您的{product}将于{date}到期，点击续费立享9折：{link}（回TD退订）",
        landingUrl: "https://example.com/renew" },
      { tenantId: DEFAULT_TENANT_ID, name: "双十一大促-营销", type: "text", reportStatus: "approved",
        content: "{name}您好！全场爆款满999减50，专属链接：{link}（回TD退订）",
        landingUrl: "https://example.com/sale" },
      { tenantId: DEFAULT_TENANT_ID, name: "新品视频彩信", type: "mms", reportStatus: "pending", content: "新品上市·视频彩信模板" },
    ],
  });

  const batch = await db.customerBatch.create({
    data: { tenantId: DEFAULT_TENANT_ID, name: "首批测试名单", checkStatus: "done", total: 5, valid: 4 },
  });
  const rows = [
    ["李响", "13800138001", "上海", "电信", false, "yes", { product: "重疾险", date: "10月12日" }],
    ["王芳", "13900139002", "北京", "移动", false, "unknown", { product: "医疗险", date: "10月20日" }],
    ["张磊", "13700137003", "广州", "联通", true, "no", { product: "意外险", date: "11月01日" }],
    ["陈静", "13600136004", "杭州", "电信", false, "yes", { product: "年金险", date: "10月15日" }],
    ["赵敏", "13500135005", "深圳", "移动", false, "unknown", { product: "寿险", date: "10月18日" }],
  ] as const;
  for (const [name, mobile, province, carrier, bl, vc, vars] of rows) {
    await db.customer.create({
      data: { tenantId: DEFAULT_TENANT_ID, name, mobile, province, carrier, isBlacklist: bl, videoCapable: vc,
              consentSource: "seed_demo", consentAt: new Date(),
              checkStatus: "done", batchId: batch.id, vars: JSON.stringify(vars) },
    });
  }
  console.log("✅ Seed 完成：默认租户/套餐/额度 + 3 模板(含千人千面) + 5 客户(含变量)");
}
main().finally(() => db.$disconnect());
