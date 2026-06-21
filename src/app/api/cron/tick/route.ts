import { NextRequest, NextResponse } from "next/server";
import { runDueCampaigns, inQuietHours } from "@/lib/scheduler";

export const dynamic = "force-dynamic";

// 外部 cron（如 Vercel Cron / 系统 crontab）每分钟调用；可用 CRON_SECRET 校验
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-cron-secret") !== secret)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await runDueCampaigns();
  return NextResponse.json({ ok: true, quietNow: inQuietHours(), ...r });
}
export const POST = GET;
