import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** GET /api/canvas/[id] — 获取画布（含节点数据） */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const canvas = await db.creativeCanvas.findFirst({
    where: { id: params.id, tenantId: session.tenantId },
  });
  if (!canvas) return NextResponse.json({ error: "画布不存在" }, { status: 404 });
  return NextResponse.json(canvas);
}

/** PUT /api/canvas/[id] — 保存画布（节点+连线）{ name?, dataJson } */
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (typeof body.name === "string") data.name = body.name.trim().slice(0, 100);
  if (typeof body.dataJson === "string") {
    // 大小上限 2MB（防写爆 SQLite）
    if (body.dataJson.length > 2_000_000) {
      return NextResponse.json({ error: "画布数据过大（上限 2MB）" }, { status: 413 });
    }
    // 校验是合法 JSON（防脏数据）
    try {
      JSON.parse(body.dataJson);
      data.dataJson = body.dataJson;
    } catch {
      return NextResponse.json({ error: "dataJson 不是合法 JSON" }, { status: 400 });
    }
  }
  const r = await db.creativeCanvas.updateMany({ where: { id: params.id, tenantId: session.tenantId }, data });
  if (r.count === 0) return NextResponse.json({ error: "画布不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

/** DELETE /api/canvas/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const r = await db.creativeCanvas.deleteMany({ where: { id: params.id, tenantId: session.tenantId } });
  if (r.count === 0) return NextResponse.json({ error: "画布不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
