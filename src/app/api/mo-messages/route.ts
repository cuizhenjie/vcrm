import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/mo-messages — 上行回复列表（可选 matched 筛选） */
export async function GET(req: NextRequest) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const matched = searchParams.get("matched"); // positive | negative | default

  const messages = await db.moMessage.findMany({
    where: {
      tenantId: session.tenantId,
      ...(matched ? { matchedAttr: matched } : {}),
    },
    orderBy: { receivedAt: "desc" },
    take: 200,
  });
  return NextResponse.json(messages);
}
