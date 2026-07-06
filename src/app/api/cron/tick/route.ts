import { NextRequest, NextResponse } from "next/server";
import { runDueCampaigns, inQuietHours } from "@/lib/scheduler";
import { dispatchOutboundEvents } from "@/lib/event-dispatcher";
import { reconcileSubscriptions } from "@/lib/subscription-scheduler";
import { checkAndNotify } from "@/lib/notification-service";

export const dynamic = "force-dynamic";

/**
 * 外部 cron（如 Vercel Cron / 系统 crontab）每分钟调用。
 * 职责：1) 扫描到期定时活动并发送 2) 投递 pending 的 OutboundEvent 到租户 Webhook。
 *
 * 安全策略（fail-closed）：
 * - 生产环境：CRON_SECRET 必须配置，请求头 x-cron-secret 必须匹配，否则 401。
 * - 开发环境：允许未配置 secret 时放行（便于本地手动触发联调），
 *   但只要配置了 secret 就必须校验通过。
 */
function authorize(req: NextRequest): NextResponse | null {
  const secret = process.env.CRON_SECRET ?? "";
  const isProd = process.env.NODE_ENV === "production";
  if (isProd && !secret) {
    return NextResponse.json({ error: "cron secret not configured" }, { status: 500 });
  }
  if (!secret) return null; // dev 未配置 → 放行
  if (req.headers.get("x-cron-secret") !== secret) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = authorize(req);
  if (guard) return guard;
  const due = await runDueCampaigns();
  // 事件投递失败不影响发送主流程，单独 catch
  let dispatched = { dispatched: 0, failed: 0, skipped: 0 };
  try {
    dispatched = await dispatchOutboundEvents();
  } catch (e) {
    console.error("[cron] event dispatch error", e);
  }
  // 订阅到期收敛（试用/续费/取消），失败不影响主流程
  let subs = { expired: 0, renewed: 0, canceled: 0 };
  try {
    subs = await reconcileSubscriptions();
  } catch (e) {
    console.error("[cron] subscription reconcile error", e);
  }
  // 通知检测（余额预警/到期提醒），失败不影响主流程
  let notifications = { notified: 0 };
  try {
    notifications = await checkAndNotify();
  } catch (e) {
    console.error("[cron] notification check error", e);
  }
  return NextResponse.json({ ok: true, quietNow: inQuietHours(), ...due, events: dispatched, subscriptions: subs, notifications });
}
export const POST = GET;
