import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/plans — 列出可购买套餐（公开定价信息，登录后可看） */
export async function GET() {
  const plans = await db.plan.findMany({
    orderBy: { monthlyFeeFen: "asc" },
  });
  return NextResponse.json(plans.map((p) => ({
    code: p.code,
    name: p.name,
    monthlyFeeFen: p.monthlyFeeFen,
    monthlyFeeYuan: (p.monthlyFeeFen / 100).toFixed(2),
    smsIncluded: p.smsIncluded,
    unitPriceFen: p.unitPriceFen,
    maxUsers: p.maxUsers,
  })));
}
