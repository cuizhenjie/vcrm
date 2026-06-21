import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  await db.smsTemplate.createMany({
    data: [
      { name: "续费提醒-千人千面", type: "text", reportStatus: "approved",
        content: "尊敬的{name}，您的{product}将于{date}到期，点击续费立享9折：{link}（回TD退订）",
        landingUrl: "https://example.com/renew" },
      { name: "双十一大促-营销", type: "text", reportStatus: "approved",
        content: "{name}您好！全场爆款满999减50，专属链接：{link}（回TD退订）",
        landingUrl: "https://example.com/sale" },
      { name: "新品视频彩信", type: "mms", reportStatus: "pending", content: "新品上市·视频彩信模板" },
    ],
  });

  const batch = await db.customerBatch.create({
    data: { name: "首批测试名单", checkStatus: "done", total: 5, valid: 4 },
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
      data: { name, mobile, province, carrier, isBlacklist: bl, videoCapable: vc,
              checkStatus: "done", batchId: batch.id, vars: JSON.stringify(vars) },
    });
  }
  console.log("✅ Seed 完成：3 模板(含千人千面) + 5 客户(含变量)");
}
main().finally(() => db.$disconnect());
