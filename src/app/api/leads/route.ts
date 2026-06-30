import { NextRequest, NextResponse } from "next/server";
import { leadCounts, listLeads } from "@/lib/leads";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const [result, counts] = await Promise.all([
    listLeads({
      intent: sp.get("intent"),
      status: sp.get("status"),
      q: sp.get("q"),
      page: Number(sp.get("page")) || 1,
      pageSize: Number(sp.get("pageSize")) || undefined,
    }),
    leadCounts(),
  ]);
  return NextResponse.json({ ...result, counts });
}
