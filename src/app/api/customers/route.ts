import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const customers = await db.customer.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  return NextResponse.json(customers);
}

// 导入名单：body = { batchName, rows: [{name?, mobile}] }
export async function POST(req: NextRequest) {
  const { batchName, rows } = await req.json();
  if (!Array.isArray(rows) || rows.length === 0)
    return NextResponse.json({ error: "名单为空" }, { status: 400 });

  const batch = await db.customerBatch.create({ data: { name: batchName ?? "未命名批次", total: rows.length } });
  await db.customer.createMany({
    data: rows
      .filter((r: any) => /^1\d{10}$/.test(String(r.mobile)))
      .map((r: any) => ({ name: r.name ?? null, mobile: String(r.mobile), batchId: batch.id })),
  });
  const valid = await db.customer.count({ where: { batchId: batch.id } });
  await db.customerBatch.update({ where: { id: batch.id }, data: { valid } });
  return NextResponse.json({ batchId: batch.id, total: rows.length, valid });
}
