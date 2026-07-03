import { NextRequest, NextResponse } from "next/server";
import { runDueCampaigns, inQuietHours } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

/**
 * 外部 cron（如 Vercel Cron / 系统 crontab）每分钟调用。
 *
 * 安全策略（fail-closed）：
 * - 生产环境：CRON_SECRET 必须配置，请求头 x-cron-secret 必须匹配，否则 401。
 * - 开发环境：允许未配置 secret 时放行（便于本地手动触发联调），
 *   但只要配置了 secret 就必须校验通过。
 * （生产环境的"必须配置 CRON_SECRET"由 instrumentation.ts 启动期强校验兜底。）
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
  const r = await runDueCampaigns();
  return NextResponse.json({ ok: true, quietNow: inQuietHours(), ...r });
}
export const POST = GET;
