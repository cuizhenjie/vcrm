import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function main() {
  await db.smsTemplate.createMany({
    data: [
      { name: "续费提醒-通知", type: "text", content: "尊敬的客户，您的保单将于近期到期，点击查看续费详情：", reportStatus: "approved" },
      { name: "双十一大促-营销", type: "text", content: "全场爆款 满999减50，活动详情：（回TD退订）", reportStatus: "approved" },
      { name: "新品视频彩信", type: "mms", content: "新品上市·视频彩信模板", reportStatus: "pending" },
    ],
  });

  const batch = await db.customerBatch.create({
    data: { name: "首批测试名单", checkStatus: "done", total: 5, valid: 4 },
  });
  const provinces = [
    ["李响", "13800138001", "上海", "电信", false, "yes"],
    ["王芳", "13900139002", "北京", "移动", false, "unknown"],
    ["张磊", "13700137003", "广州", "联通", true, "no"],
    ["陈静", "13600136004", "杭州", "电信", false, "yes"],
    ["赵敏", "13500135005", "深圳", "移动", false, "unknown"],
  ] as const;
  for (const [name, mobile, province, carrier, bl, vc] of provinces) {
    await db.customer.create({
      data: { name, mobile, province, carrier, isBlacklist: bl, videoCapable: vc, checkStatus: "done", batchId: batch.id },
    });
  }
  console.log("✅ Seed 完成：3 个模板 + 1 个批次 + 5 个客户");
}
main().finally(() => db.$disconnect());
