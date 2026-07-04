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
  const body = await req.json().catch(() => ({}));
  const { name, type, content, landingUrl, signatureId, submit } = body;
  if (!name || !content) return NextResponse.json({ error: "名称与内容必填" }, { status: 400 });
  // 创建时即做敏感词预检：命中直接 rejected，否则按 submit 决定 draft/pending
  const risk = await contentRiskReason(content, tenantId);
  const tpl = await db.smsTemplate.create({
    data: {
      tenantId,
      name,
      type: type ?? "text",
      content,
      landingUrl: landingUrl || null,
      signatureId: signatureId || null,
      // submit=true 立即提交审核→pending；否则存为 draft 草稿
      reportStatus: risk ? "rejected" : submit === false ? "draft" : "pending",
      reportSubmittedAt: risk || submit === false ? null : new Date(),
      reportReviewedAt: risk ? new Date() : null,
      rejectReason: risk,
    },
  });
  return NextResponse.json(tpl);
}
