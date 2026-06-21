import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const customers = await db.customer.findMany({
    where: { isBlacklist: false }, select: { province: true, carrier: true },
  });
  const provinces = [...new Set(customers.map((c) => c.province).filter(Boolean))] as string[];
  const carriers = [...new Set(customers.map((c) => c.carrier).filter(Boolean))] as string[];
  return NextResponse.json({ provinces, carriers, total: customers.length });
}
