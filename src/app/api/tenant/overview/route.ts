import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { smsCreditBalance } from "@/lib/billing";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenantId = currentTenantId();
  const tenant = await db.tenant.upsert({
    where: { id: tenantId },
    update: {},
    create: { id: tenantId, slug: "default", name: "默认租户" },
  });
  const [balance, subscription, ledger, usage, jobs, attempts, suppressions, events] = await Promise.all([
    smsCreditBalance(tenantId),
    db.subscription.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      include: { plan: true },
    }),
    db.creditLedger.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.usageRecord.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.sendJob.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 10 }),
    db.messageAttempt.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.suppression.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.outboundEvent.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  return NextResponse.json({ tenant, balance, subscription, ledger, usage, jobs, attempts, suppressions, events });
}

