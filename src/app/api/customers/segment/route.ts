import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSegmentWhere } from "@/lib/segment";

export async function POST(req: NextRequest) {
  const segment = await req.json().catch(() => ({}));
  const count = await db.customer.count({ where: buildSegmentWhere(segment) });
  return NextResponse.json({ count });
}
