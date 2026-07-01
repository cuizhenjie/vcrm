import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";
import { contentRiskReason } from "@/lib/compliance";

export const dynamic = "force-dynamic";

export async function GET() {
  const tenantId = currentTenantId();
  return NextResponse.json(await db.smsTemplate.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } }));
}
export async function POST(req: NextRequest) {
  const tenantId = currentTenantId();
  const { name, type, content, landingUrl } = await req.json();
  if (!name || !content) return NextResponse.json({ error: "名称与内容必填" }, { status: 400 });
  const risk = contentRiskReason(content);
  const tpl = await db.smsTemplate.create({
    data: {
      tenantId,
      name,
      type: type ?? "text",
      content,
      landingUrl: landingUrl || null,
      reportStatus: risk ? "rejected" : "pending",
      reportSubmittedAt: new Date(),
      reportReviewedAt: risk ? new Date() : null,
      rejectReason: risk,
    },
  });
  return NextResponse.json(tpl);
}
