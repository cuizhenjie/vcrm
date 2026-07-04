import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/signatures — 列出租户签名 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db.smsSignature.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(list);
}

/** POST /api/signatures — 新建签名 { signName, source?, isDefault? } */
export async function POST(req: NextRequest) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const signName = typeof body.signName === "string" ? body.signName.trim().slice(0, 50) : "";
  if (!signName) return NextResponse.json({ error: "签名名称必填" }, { status: 400 });
  const source = typeof body.source === "string" ? body.source.slice(0, 20) : "company";

  try {
    const created = await db.smsSignature.create({
      data: {
        tenantId: session.tenantId,
        signName,
        source,
        reportStatus: "pending",
        reportSubmittedAt: new Date(),
        isDefault: !!body.isDefault,
      },
    });
    // 若设为默认，取消其他默认
    if (body.isDefault) {
      await db.smsSignature.updateMany({
        where: { tenantId: session.tenantId, id: { not: created.id }, isDefault: true },
        data: { isDefault: false },
      });
    }
    return NextResponse.json({ ok: true, id: created.id });
  } catch (e: any) {
    if (String(e?.message ?? "").includes("Unique")) {
      return NextResponse.json({ error: "该签名已存在" }, { status: 409 });
    }
    throw e;
  }
}
