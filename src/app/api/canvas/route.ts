import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";

/** GET /api/canvas — 列出租户画布 */
export async function GET() {
  const guard = requireRole("sales");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const list = await db.creativeCanvas.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, updatedAt: true, createdAt: true },
  });
  return NextResponse.json(list);
}

/** POST /api/canvas — 新建画布 { name? } */
export async function POST(req: NextRequest) {
  const guard = requireRole("sales");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "未命名画布";
  const canvas = await db.creativeCanvas.create({
    data: { tenantId: session.tenantId, name },
  });
  return NextResponse.json(canvas);
}
