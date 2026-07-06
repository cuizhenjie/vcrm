import { db } from "./db";
import { smsCreditBalance } from "./billing";

/**
 * 通知服务：站内信 + 可选邮件。
 *
 * 触发场景：
 *   - low_balance: 余额低于阈值（默认 200 条）→ 预警 + 提示充值
 *   - subscription_expiring: 订阅/试用即将到期（3 天内）→ 提醒续费
 *   - 由 cron 定期检测，或业务事件（充值成功/视频完成）直接调用
 *
 * 邮件：配了 SMTP_* 环境变量时发送，否则仅站内信。
 * 去重：同类型通知 24h 内不重复（防刷屏）。
 */

/** 创建一条站内通知（+ 可选邮件）。24h 内同类型不重复。 */
export async function createNotification(input: {
  tenantId: string;
  userId?: string;
  type: string;
  title: string;
  body: string;
  level?: "info" | "warn" | "error";
}): Promise<void> {
  // 去重：24h 内同租户同类型不重复
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  const exists = await db.notification.findFirst({
    where: { tenantId: input.tenantId, type: input.type, createdAt: { gte: since } },
    select: { id: true },
  });
  if (exists) return;

  await db.notification.create({
    data: {
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      type: input.type,
      title: input.title,
      body: input.body,
      level: input.level ?? "info",
    },
  });

  // 邮件（可选）：配了 SMTP 才发，失败不影响主流程
  await trySendEmail(input.tenantId, input.title, input.body).catch(() => {});
}

/** 扫描所有租户，检测余额预警 + 订阅到期提醒。由 cron 调用。 */
export async function checkAndNotify(): Promise<{ notified: number }> {
  let notified = 0;
  const threshold = Number(process.env.LOW_BALANCE_THRESHOLD ?? 200);
  const now = new Date();
  const expiringSoon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

  // 取所有 active 租户
  const tenants = await db.tenant.findMany({
    where: { status: "active" },
    select: { id: true, name: true },
  });

  for (const tenant of tenants) {
    // 1. 余额预警
    const balance = await smsCreditBalance(tenant.id);
    if (balance < threshold) {
      await createNotification({
        tenantId: tenant.id,
        type: "low_balance",
        title: "短信额度不足",
        body: `当前余额仅剩 ${balance} 条，请及时充值以免影响发送。`,
        level: "warn",
      });
      notified++;
    }

    // 2. 订阅到期提醒
    const sub = await db.subscription.findFirst({
      where: { tenantId: tenant.id, status: { in: ["trialing", "active"] } },
      orderBy: { createdAt: "desc" },
    });
    if (sub?.currentPeriodEnd && sub.currentPeriodEnd < expiringSoon) {
      const days = Math.ceil((sub.currentPeriodEnd.getTime() - now.getTime()) / (24 * 3600 * 1000));
      await createNotification({
        tenantId: tenant.id,
        type: "subscription_expiring",
        title: sub.status === "trialing" ? "试用即将到期" : "订阅即将到期",
        body: days > 0 ? `您的${sub.status === "trialing" ? "试用" : "订阅"}将在 ${days} 天后到期，请及时续费。` : `您的订阅已到期，续费后可继续使用。`,
        level: days <= 1 ? "error" : "warn",
      });
      notified++;
    }
  }

  return { notified };
}

/** 邮件发送（SMTP）。未配 SMTP_* 则跳过。 */
async function trySendEmail(tenantId: string, subject: string, body: string): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  if (!smtpHost || !smtpUser || !smtpPass) return; // 未配 SMTP，跳过

  // 取租户 owner 邮箱
  const owner = await db.appUser.findFirst({
    where: { tenantId, role: "owner", status: "active" },
    select: { email: true },
  });
  if (!owner) return;

  // 用 nodemailer 发送（动态 import，未装则跳过）
  try {
    const nodemailer = await import("nodemailer");
    const transporter = (nodemailer as any).createTransport({
      host: smtpHost,
      port: Number(smtpPort) || 587,
      secure: Number(smtpPort) === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });
    await transporter.sendMail({
      from: `"VCRM" <${smtpUser}>`,
      to: owner.email,
      subject,
      text: body,
    });
  } catch (e) {
    console.warn("[notification] 邮件发送失败", e instanceof Error ? e.message : e);
  }
}
