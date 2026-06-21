import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  return NextResponse.json(await db.smsTemplate.findMany({ orderBy: { createdAt: "desc" } }));
}
export async function POST(req: NextRequest) {
  const { name, type, content, landingUrl } = await req.json();
  if (!name || !content) return NextResponse.json({ error: "名称与内容必填" }, { status: 400 });
  const tpl = await db.smsTemplate.create({ data: { name, type: type ?? "text", content, landingUrl: landingUrl || null, reportStatus: "pending" } });
  return NextResponse.json(tpl);
}
