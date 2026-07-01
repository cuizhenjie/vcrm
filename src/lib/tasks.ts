import { db } from "./db";
import { getProvider } from "./sms";
import { checkRisk, recentlySent } from "./risk";
import { render, parseVars } from "./render";
import { createShortLink } from "./shortlink";
import { reserveSmsCredit, InsufficientCreditsError } from "./billing";
import { contentRiskReason, isSuppressed } from "./compliance";
import { emitOutboundEvent } from "./events";

/**
 * 轻量任务处理器（生产版前置骨架）：
 * 任务记录→检测→合规/频控/额度→限速分批发送→审计尝试→回写状态。
 * 生产升级路径：抽到独立 worker + BullMQ，支持重试/优先级/可视化。
 */
export async function processCampaign(campaignId: string, phase?: "test" | "rollout") {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, variants: { include: { template: true } } },
  });
  if (!campaign) return;

  const tenantId = campaign.tenantId;
  const job = await db.sendJob.create({
    data: { tenantId, campaignId, phase, status: "running" },
  });
  await db.campaign.update({ where: { id: campaignId }, data: { status: "sending" } });
  const provider = getProvider();
  const rate = Number(process.env.SEND_RATE_PER_SEC ?? 20);

  const recipients = await db.recipient.findMany({
    where: { campaignId, sendStatus: "pending", ...(phase ? { phase } : {}) },
    include: { customer: true, variant: { include: { template: true } } },
  });
  await db.sendJob.update({ where: { id: job.id }, data: { total: recipients.length, lockedAt: new Date() } });

  let sent = 0;
  for (let i = 0; i < recipients.length; i += rate) {
    // 运营可中途停止：每批前检查状态
    const fresh = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    if (fresh?.status === "stopped") return;
    const batch = recipients.slice(i, i + rate);
    await Promise.all(
      batch.map(async (r) => {
        const tplObj = r.variant?.template ?? campaign.template;
        const attemptKey = `${r.id}:${provider.name}`;
        const failBeforeSend = async (reason: string, status: "failed" | "filtered" = "filtered") => {
          await db.$transaction(async (tx) => {
            await tx.messageAttempt.upsert({
              where: { idempotencyKey: attemptKey },
              update: { tenantId, status, errorCode: reason, attemptNo: { increment: 1 } },
              create: {
                tenantId,
                recipientId: r.id,
                provider: provider.name,
                idempotencyKey: attemptKey,
                status,
                errorCode: reason,
              },
            });
            await tx.recipient.update({
              where: { id: r.id },
              data: { sendStatus: status, failReason: reason },
            });
          });
        };

        // 风控
        if (r.customer) {
          const v = checkRisk(r.customer);
          if (!v.pass) {
            await failBeforeSend(v.reason ?? "risk_blocked");
            return;
          }
        }
        const suppressed = await isSuppressed(r.mobile, tenantId);
        if (suppressed) {
          await failBeforeSend(`抑制名单：${suppressed}`);
          return;
        }
        if (await recentlySent(r.mobile, Number(process.env.FREQUENCY_DAYS ?? 1), tenantId)) {
          await failBeforeSend("频控命中：同号近期已触达");
          return;
        }
        // A/B：优先用收件人所属变体的模板，回退活动默认模板
        if (!tplObj) {
          await failBeforeSend("缺少短信模板", "failed");
          return;
        }
        if (tplObj.reportStatus !== "approved") {
          await failBeforeSend(`模板未报备通过：${tplObj.reportStatus}`);
          return;
        }
        // 千人千面：变量替换 + 每条专属短链注入
        const tpl = tplObj.content ?? "";
        const data: Record<string, string> = { name: r.customer?.name ?? "", ...parseVars(r.customer?.vars) };
        if (tpl.includes("{link}")) {
          const target = tplObj.landingUrl || process.env.APP_BASE_URL || "http://localhost:3000";
          const link = await createShortLink(target, r.id, tenantId); // trackId=r.id → 点击回填 visited
          data.link = link.shortUrl;
        }
        const content = render(tpl, data);
        const contentReason = contentRiskReason(content);
        if (contentReason) {
          await failBeforeSend(contentReason);
          return;
        }

        try {
          await db.$transaction(async (tx) => {
            await reserveSmsCredit(tx, { tenantId, recipientId: r.id, type: campaign.type === "video_sms" ? "mms" : campaign.type === "flash" ? "flash" : "sms" });
            await tx.messageAttempt.upsert({
              where: { idempotencyKey: attemptKey },
              update: {
                tenantId,
                provider: provider.name,
                status: "started",
                requestJson: JSON.stringify({ mobile: r.mobile, type: campaign.type, templateId: tplObj.id }),
                attemptNo: { increment: 1 },
              },
              create: {
                tenantId,
                recipientId: r.id,
                provider: provider.name,
                idempotencyKey: attemptKey,
                status: "started",
                requestJson: JSON.stringify({ mobile: r.mobile, type: campaign.type, templateId: tplObj.id }),
              },
            });
          });
        } catch (e) {
          if (e instanceof InsufficientCreditsError) {
            await failBeforeSend(e.message, "failed");
            await db.campaign.update({
              where: { id: campaignId },
              data: { complianceStatus: "blocked", blockedReason: e.message },
            });
            return;
          }
          throw e;
        }

        const res =
          campaign.type === "video_sms"
            ? await provider.sendMms({ mobile: r.mobile, templateId: tplObj.id, extno: r.extno })
            : campaign.type === "flash"
            ? await provider.sendFlash({ mobile: r.mobile, content, extno: r.extno })
            : await provider.sendText({ mobile: r.mobile, content, extno: r.extno });

        await db.$transaction(async (tx) => {
          await tx.messageAttempt.update({
            where: { idempotencyKey: attemptKey },
            data: {
              status: res.ok ? "sent" : "failed",
              providerMessageId: res.messageId,
              responseJson: JSON.stringify(res.raw ?? {}),
              errorCode: res.ok ? null : res.code ?? "send_failed",
            },
          });
          await tx.recipient.update({
            where: { id: r.id },
            data: res.ok
              ? { sendStatus: "sent" }
              : { sendStatus: "failed", failReason: res.code ?? "send_failed" },
          });
        });
        if (!res.ok) {
          await emitOutboundEvent("message.failed", { recipientId: r.id, mobile: r.mobile, campaignId, code: res.code }, tenantId);
        }
        if (res.ok) sent++;
      })
    );
    await new Promise((res) => setTimeout(res, 1000)); // 限速：每秒一批
    await db.campaign.update({ where: { id: campaignId }, data: { sent: (await countSent(campaignId)) } });
    await db.sendJob.update({ where: { id: job.id }, data: { processed: Math.min(i + rate, recipients.length) } });
  }

  const cur = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
  if (cur?.status === "stopped") {
    await db.sendJob.update({ where: { id: job.id }, data: { status: "stopped" } });
    return;
  }
  const remaining = await db.recipient.count({ where: { campaignId, sendStatus: "pending" } });
  await db.campaign.update({
    where: { id: campaignId },
    data: {
      status: remaining > 0 ? "sending" : "done",
      sent: await countSent(campaignId),
      complianceStatus: remaining > 0 ? campaign.complianceStatus : "passed",
    },
  });
  await db.sendJob.update({ where: { id: job.id }, data: { status: remaining > 0 ? "running" : "done" } });
}

const countSent = (campaignId: string) =>
  db.recipient.count({ where: { campaignId, sendStatus: "sent" } });
