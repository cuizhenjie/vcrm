import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { invalidateSensitiveCache } from "@/lib/compliance";

export const dynamic = "force-dynamic";

/** GET /api/sensitive-words — 列出租户敏感词库 */
export async function GET(req: NextRequest) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const list = await db.sensitiveWord.findMany({
    where: { tenantId: session.tenantId, ...(category ? { category } : {}) },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(list);
}

/** POST /api/sensitive-words — 批量新增敏感词 { words: [{word, category?}] } */
export async function POST(req: NextRequest) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));
  const words = Array.isArray(body.words) ? body.words : [];
  if (words.length === 0) return NextResponse.json({ error: "words 必填" }, { status: 400 });

  // 去重 + 校验，跳过已存在的
  const existing = new Set(
    (await db.sensitiveWord.findMany({
      where: { tenantId: session.tenantId },
      select: { word: true },
    })).map((r) => r.word),
  );
  const toCreate: Array<{ tenantId: string; word: string; category: string; status: string }> = words
    .filter((w: any) => w && typeof w.word === "string" && w.word.trim() && !existing.has(w.word.trim()))
    .map((w: any) => ({
      tenantId: session.tenantId,
      word: String(w.word).trim().slice(0, 50),
      category: typeof w.category === "string" ? w.category.slice(0, 30) : "general",
      status: "active" as string,
    }));
  if (toCreate.length > 0) {
    await db.sensitiveWord.createMany({ data: toCreate });
  }
  invalidateSensitiveCache(session.tenantId);
  return NextResponse.json({ ok: true, added: toCreate.length, skipped: words.length - toCreate.length });
}
