import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSegmentWhere } from "@/lib/segment";
import { currentTenantId } from "@/lib/tenant";
import { requireRole } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  const __guard = requireRole("sales");
  if (__guard) return __guard;
  const tenantId = currentTenantId();
  const segment = await req.json().catch(() => ({}));
  const count = await db.customer.count({ where: buildSegmentWhere({ ...segment, tenantId }) });
  return NextResponse.json({ count });
}
