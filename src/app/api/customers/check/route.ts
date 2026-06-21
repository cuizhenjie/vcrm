import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/sms";

// body = { batchId }
export async function POST(req: NextRequest) {
  const { batchId } = await req.json();
  const customers = await db.customer.findMany({ where: batchId ? { batchId } : { checkStatus: "pending" } });
  if (customers.length === 0) return NextResponse.json({ checked: 0 });

  const results = await getProvider().checkNumbers(customers.map((c) => c.mobile));
  let valid = 0;
  for (const c of customers) {
    const r = results.find((x) => x.mobile === c.mobile);
    const empty = r?.status === "empty";
    if (!empty && !c.isBlacklist) valid++;
    await db.customer.update({
      where: { id: c.id },
      data: { checkStatus: "done", province: r?.province ?? c.province, carrier: r?.carrier ?? c.carrier,
               isBlacklist: empty ? true : c.isBlacklist },
    });
  }
  if (batchId) await db.customerBatch.update({ where: { id: batchId }, data: { checkStatus: "done", valid } });
  return NextResponse.json({ checked: customers.length, valid });
}
