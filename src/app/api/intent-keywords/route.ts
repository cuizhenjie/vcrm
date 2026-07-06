import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { requireRole } from "@/lib/rbac";
import { invalidateIntentCache } from "@/lib/intent-service";

export const dynamic = "force-dynamic";

/** GET /api/intent-keywords — 列出意图词库 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db.intentKeyword.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ intent: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json(list);
}

/** POST /api/intent-keywords — 批量新增 { words: [{word, intent}] }（admin） */
export async function POST(req: NextRequest) {
  const guard = requireRole("admin");
  if (guard) return guard;
  const session = getCurrentSession()!;
  const body = await req.json().catch(() => ({}));
  const VALID_INTENTS = ["positive", "negative", "unsubscribe"];
  const words = Array.isArray(body.words)
    ? body.words.filter((w: any) => w && typeof w.word === "string" && VALID_INTENTS.includes(w.intent))
    : [];
  if (words.length === 0) return NextResponse.json({ error: "words 必填，intent 需为 positive/negative/unsubscribe" }, { status: 400 });

  const existing = new Set(
    (await db.intentKeyword.findMany({ where: { tenantId: session.tenantId }, select: { word: true } }))
      .map((r) => r.word),
  );
  const toCreate = words
    .filter((w: any) => !existing.has(w.word.trim()))
    .map((w: any) => ({
      tenantId: session.tenantId,
      word: w.word.trim().slice(0, 50),
      intent: w.intent,
      status: "active" as string,
    }));
  if (toCreate.length > 0) await db.intentKeyword.createMany({ data: toCreate });
  invalidateIntentCache(session.tenantId);
  return NextResponse.json({ ok: true, added: toCreate.length, skipped: words.length - toCreate.length });
}
