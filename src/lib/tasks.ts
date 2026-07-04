import { db } from "./db";
import { getProvider } from "./sms";
import { checkRisk } from "./risk";
import { recentlySent, markSent } from "./frequency";
import { render, parseVars } from "./render";
import { createShortLink } from "./shortlink";
import { reserveSmsCredit, InsufficientCreditsError } from "./billing";
import { contentRiskReason, isSuppressed } from "./compliance";
import { emitOutboundEvent } from "./events";
import { inQuietHours } from "./scheduler";
import { safeLog } from "./pii";

/** 信号量：额度不足时抛出，用于跳出整个活动循环（非单条失败）。 */
class CampaignAborted extends Error {
  constructor(public reason: string, public blocked: boolean) {
    super(reason);
    this.name = "CampaignAborted";
  }
}

/**
 * 轻量任务处理器（生产版前置骨架）：
 * 任务记录→检测→合规/频控/额度→限速分批发送→审计尝试→回写状态。
 * 生产升级路径：抽到独立 worker + BullMQ，支持重试/优先级/可视化。
 *
 * 状态收敛保证（v2）：整个流程用 try/catch/finally 包裹，
 * 任何异常下 campaign.status 与 SendJob.status 都会被收敛到终态，
 * 不会永久卡在 sending/running 导致无法重发/停止。
 */
export async function processCampaign(campaignId: string, phase?: "test" | "rollout") {
  const campaign = await db.campaign.findUnique({
    where: { id: campaignId },
    include: { template: true, variants: { include: { template: true } } },
  });
  if (!campaign) return;

  const tenantId = campaign.tenantId;

  // 合规守卫：活动开启避扰时段(quietHours)时，命中夜间时段不发送，标记 deferred 由 cron 重试。
  if (campaign.quietHours && inQuietHours()) {
    await db.campaign.update({
      where: { id: campaignId },
      data: { status: "scheduled", complianceStatus: "deferred", blockedReason: "命中避扰时段，等待 cron 在日间自动重试" },
    });
    return;
  }

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

  let aborted = false; // 额度不足等需要整体中止的标志
  let hadError = false; // 普通异常标志（用于 finally 收敛为可重试态而非卡 sending）
  try {
    for (let i = 0; i < recipients.length; i += rate) {
      // 运营可中途停止：每批前检查状态
      const fresh = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
      if (fresh?.status === "stopped") break;
      // 批级 abort 信号：额度不足时同批并发任务能感知并停止发送（防已扣费号码继续发）
      let batchAborted = false;
      const batch = recipients.slice(i, i + rate);
      await Promise.all(
        batch.map(async (r) => {
          // 批内其他号码已触发额度不足 → 本条不再处理
          if (batchAborted) return;
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
            const link = await createShortLink(target, r.id, tenantId);
            data.link = link.shortUrl;
          }
          const content = render(tpl, data);
          const contentReason = await contentRiskReason(content, tenantId);
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
              // 先置批级 abort 信号（即使 failBeforeSend 失败也保证中止生效）
              batchAborted = true;
              // 标记本条失败，剩余保持 pending 待充值重试
              await failBeforeSend(e.message, "failed").catch(() => {});
              // 抛信号跳出外层 for 循环
              throw new CampaignAborted(e.message, true);
            }
            throw e;
          }

          // 额度不足已被同批触发 → 不再调用 provider 发送（防扣费后继续发）
          if (batchAborted) return;

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
          } else {
            // 发送成功：写入频控标记（Redis 有配则用 Redis，否则仅 DB 记录已够）
            await markSent(r.mobile, Number(process.env.FREQUENCY_DAYS ?? 1), tenantId);
          }
        })
      );
      if (batchAborted) throw new CampaignAborted("额度不足", true); // 触发 catch 收敛
      await new Promise((res) => setTimeout(res, 1000)); // 限速：每秒一批
      await db.campaign.update({ where: { id: campaignId }, data: { sent: (await countSent(campaignId)) } });
      await db.sendJob.update({ where: { id: job.id }, data: { processed: Math.min(i + rate, recipients.length) } });
    }
  } catch (e) {
    if (e instanceof CampaignAborted) {
      aborted = true;
      // 额度不足：标记阻断，剩余 recipient 保持 pending（充值后可重试）
      await db.campaign.update({
        where: { id: campaignId },
        data: { complianceStatus: "blocked", blockedReason: e.reason },
      }).catch(() => {});
    } else {
      hadError = true;
      // 其他异常：记录到 job，避免吞错（日志脱敏防 PII 泄露）
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[processCampaign] campaign=${campaignId} 异常:`, safeLog(msg));
      await db.sendJob.update({
        where: { id: job.id },
        data: { lastError: msg.slice(0, 500) },
      }).catch(() => {});
    }
  } finally {
    // 状态收敛：无论成功/中止/异常，都把 campaign 和 job 收敛到终态
    // 关键：异常路径(hadError)且有剩余时收敛为 pending/failed（可重试），而非 sending/running（会永久卡死）
    const cur = await db.campaign.findUnique({ where: { id: campaignId }, select: { status: true } });
    const isStopped = cur?.status === "stopped";
    const remaining = await db.recipient.count({ where: { campaignId, sendStatus: "pending" } });
    // 状态矩阵：stopped→stopped；aborted 且有剩余→pending(可重试)；异常且有剩余→pending(可重试)；正常完成无剩余→done
    const finalCampaignStatus = isStopped
      ? "stopped"
      : remaining > 0
        ? (aborted || hadError ? "pending" : "sending")
        : "done";
    const finalJobStatus = isStopped
      ? "stopped"
      : remaining > 0
        ? (aborted || hadError ? "failed" : "running")
        : "done";
    await db.campaign.update({
      where: { id: campaignId },
      data: {
        status: finalCampaignStatus,
        sent: await countSent(campaignId),
        complianceStatus: aborted ? "blocked" : remaining > 0 ? campaign.complianceStatus : "passed",
      },
    }).catch(() => {});
    await db.sendJob.update({
      where: { id: job.id },
      data: { status: finalJobStatus, lockedAt: null },
    }).catch(() => {});
  }
}

const countSent = (campaignId: string) =>
  db.recipient.count({ where: { campaignId, sendStatus: "sent" } });
