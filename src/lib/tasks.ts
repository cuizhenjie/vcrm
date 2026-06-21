import { db } from "./db";
import { getProvider } from "./sms";
import { checkRisk } from "./risk";
import { render, parseVars } from "./render";
import { createShortLink } from "./shortlink";

/**
 * 轻量任务处理器（替代 BullMQ/Redis）：
 * 检测→风控→限速分批发送→回写状态。
 * 生产升级路径：抽到独立 worker + BullMQ，支持重试/优先级/可视化。
 */
export async function processCampaign(campaignId: string) {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true },
  });
  if (!campaign) return;

  await db.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });
  const provider = getProvider();
  const rate = Number(process.env.SEND_RATE_PER_SEC ?? 20);

  const recipients = await db.recipient.findMany({
    where: { campaignId, sendStatus: "pending" },
    include: { customer: true },
  });

  let sent = 0;
  for (let i = 0; i < recipients.length; i += rate) {
    const batch = recipients.slice(i, i + rate);
    await Promise.all(
      batch.map(async (r) => {
        // 风控
        if (r.customer) {
          const v = checkRisk(r.customer);
          if (!v.pass) {
            await db.recipient.update({ where: { id: r.id }, data: { sendStatus: "filtered", failReason: v.reason } });
            return;
          }
        }
        // 千人千面：变量替换 + 每条专属短链注入
        const tpl = campaign.template?.content ?? "";
        const data: Record<string, string> = { name: r.customer?.name ?? "", ...parseVars(r.customer?.vars) };
        if (tpl.includes("{link}")) {
          const target = campaign.template?.landingUrl || process.env.APP_BASE_URL || "http://localhost:3000";
          const link = await createShortLink(target, r.id); // trackId=r.id → 点击回填 visited
          data.link = link.shortUrl;
        }
        const content = render(tpl, data);
        const res =
          campaign.type === "video_sms"
            ? await provider.sendMms({ mobile: r.mobile, templateId: campaign.templateId ?? "", extno: r.extno })
            : campaign.type === "flash"
            ? await provider.sendFlash({ mobile: r.mobile, content, extno: r.extno })
            : await provider.sendText({ mobile: r.mobile, content, extno: r.extno });

        await db.recipient.update({
          where: { id: r.id },
          data: res.ok
            ? { sendStatus: "sent" }
            : { sendStatus: "failed", failReason: res.code ?? "send_failed" },
        });
        if (res.ok) sent++;
      })
    );
    await new Promise((res) => setTimeout(res, 1000)); // 限速：每秒一批
    await db.campaign.update({ where: { id: campaignId }, data: { sent: (await countSent(campaignId)) } });
  }

  await db.campaign.update({ where: { id: campaignId }, data: { status: "done", sent: await countSent(campaignId) } });
}

const countSent = (campaignId: string) =>
  db.recipient.count({ where: { campaignId, sendStatus: "sent" } });
