import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
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
  // 更多套餐（商业化定价）
  await db.plan.upsert({
    where: { code: "growth" },
    update: { name: "Growth", monthlyFeeFen: 9900, smsIncluded: 20000, unitPriceFen: 5, maxUsers: 10 },
    create: { code: "growth", name: "Growth", monthlyFeeFen: 9900, smsIncluded: 20000, unitPriceFen: 5, maxUsers: 10 },
  });
  await db.plan.upsert({
    where: { code: "business" },
    update: { name: "Business", monthlyFeeFen: 29900, smsIncluded: 80000, unitPriceFen: 4, maxUsers: 50 },
    create: { code: "business", name: "Business", monthlyFeeFen: 29900, smsIncluded: 80000, unitPriceFen: 4, maxUsers: 50 },
  });
  const hasSubscription = await db.subscription.count({ where: { tenantId: DEFAULT_TENANT_ID } });
  if (!hasSubscription) {
    await db.subscription.create({
      data: { tenantId: DEFAULT_TENANT_ID, planId: plan.id, status: "trialing" },
    });
  }
  // 默认管理员：密码取 SEED_ADMIN_PASSWORD（默认 admin），生产部署后请立即改密或注册新租户
  const adminPwd = process.env.SEED_ADMIN_PASSWORD ?? "admin";
  const passwordHash = await bcrypt.hash(adminPwd, 10);
  await db.appUser.upsert({
    where: { tenantId_email: { tenantId: DEFAULT_TENANT_ID, email: "admin@vcrm.local" } },
    update: { name: "运营管理员", role: "owner", status: "active", passwordHash },
    create: { tenantId: DEFAULT_TENANT_ID, email: "admin@vcrm.local", name: "运营管理员", role: "owner", passwordHash, status: "active" },
  });
  const hasSeedGrant = await db.creditLedger.count({
    where: { tenantId: DEFAULT_TENANT_ID, reason: "seed_grant" },
  });
  if (!hasSeedGrant) {
    await db.creditLedger.create({
      data: { tenantId: DEFAULT_TENANT_ID, delta: 10000, balanceAfter: 10000, reason: "seed_grant" },
    });
  }

  // 敏感词库 seed（行业通用高危词，运营可在控制台增补）
  const SEED_WORDS: Array<[string, string]> = [
    ["办证", "fraud"], ["刻章", "fraud"], ["代考", "fraud"], ["试卷答案", "fraud"], ["走私", "fraud"],
    ["管制刀具", "fraud"], ["套现", "finance"], ["洗钱", "finance"], ["代开发票", "finance"],
    ["刷单", "commerce"], ["代还信用卡", "finance"], ["保本", "finance"], ["零风险", "finance"],
    ["日赚", "finance"], ["月入百万", "finance"], ["博彩", "gambling"], ["赌博", "gambling"],
    ["开奖", "gambling"], ["下注", "gambling"], ["丰胸", "medical"], ["增高", "medical"],
    ["壮阳", "medical"], ["性药", "medical"], ["梅毒", "medical"], ["淋病", "medical"],
  ];
  for (const [word, category] of SEED_WORDS) {
    await db.sensitiveWord.upsert({
      where: { tenantId_word: { tenantId: DEFAULT_TENANT_ID, word } },
      update: { category, status: "active" },
      create: { tenantId: DEFAULT_TENANT_ID, word, category, status: "active" },
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
