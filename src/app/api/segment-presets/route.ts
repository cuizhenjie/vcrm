import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildSegmentWhere } from "@/lib/segment";

export const dynamic = "force-dynamic";

/** 列出所有分群预设 */
export async function GET() {
  const list = await db.segmentPreset.findMany({ orderBy: { createdAt: "desc" } });
  // 把 JSON 字段解析回数组，方便前端直接用
  const parsed = list.map((p) => ({
    ...p,
    provinces: p.provinces ? JSON.parse(p.provinces) : [],
    carriers: p.carriers ? JSON.parse(p.carriers) : [],
  }));
  return NextResponse.json(parsed);
}

/** 创建分群预设：name + segment */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { name, batchId, provinces, carriers, onlyIntent } = body;
  if (!name || !name.trim()) return NextResponse.json({ error: "名称必填" }, { status: 400 });

  // 保存时先算一次匹配数（不强制准确，但给运营参考）
  const where = buildSegmentWhere({ batchId, provinces, carriers, onlyIntent });
  const matchCount = await db.customer.count({ where });

  const preset = await db.segmentPreset.create({
    data: {
      name: name.trim(),
      batchId: batchId || null,
      provinces: provinces && provinces.length ? JSON.stringify(provinces) : null,
      carriers: carriers && carriers.length ? JSON.stringify(carriers) : null,
      onlyIntent: !!onlyIntent,
      matchCount,
    },
  });
  return NextResponse.json({
    ...preset,
    provinces: preset.provinces ? JSON.parse(preset.provinces) : [],
    carriers: preset.carriers ? JSON.parse(preset.carriers) : [],
  });
}
