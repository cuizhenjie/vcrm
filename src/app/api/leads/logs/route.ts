import { NextRequest, NextResponse } from "next/server";
import { listFollowLogs } from "@/lib/follow-logs";

export const dynamic = "force-dynamic";

// GET /api/leads/logs            → 全局最近跟进动态
// GET /api/leads/logs?recipientId → 该线索的跟进时间线
export async function GET(req: NextRequest) {
  const logs = await listFollowLogs(req.nextUrl.searchParams.get("recipientId"));
  return NextResponse.json({ logs });
}
