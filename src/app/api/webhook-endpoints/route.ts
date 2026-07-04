import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentSession } from "@/lib/session";
import { validatePublicUrl } from "@/lib/ssrf-guard";

export const dynamic = "force-dynamic";

/** GET /api/webhook-endpoints — 列出租户的 webhook 配置 */
export async function GET() {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const list = await db.webhookEndpoint.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: "desc" },
  });
  // secret 不返回明文，仅返回是否已配置
  return NextResponse.json(list.map((e) => ({
    ...e,
    secret: e.secret ? "******" : "",
    hasSecret: !!e.secret,
  })));
}

/** POST /api/webhook-endpoints — 新建 webhook 配置 { name, url, secret?, eventTypes: string[] } */
export async function POST(req: NextRequest) {
  const session = getCurrentSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  // 校验
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";
  const url = typeof body.url === "string" ? body.url.trim().slice(0, 500) : "";
  const secret = typeof body.secret === "string" && body.secret.trim() ? body.secret.trim().slice(0, 200) : null;
  if (!name) return NextResponse.json({ error: "名称必填" }, { status: 400 });
  const urlErr = validatePublicUrl(url);
  if (urlErr) return NextResponse.json({ error: urlErr }, { status: 400 });
  const eventTypes = Array.isArray(body.eventTypes) ? body.eventTypes.filter((t: any) => typeof t === "string").slice(0, 50) : [];
  if (eventTypes.length === 0) return NextResponse.json({ error: "至少订阅一个事件类型" }, { status: 400 });

  const created = await db.webhookEndpoint.create({
    data: {
      tenantId: session.tenantId,
      name,
      url,
      secret,
      eventTypes: JSON.stringify(eventTypes),
      status: "active",
    },
  });
  return NextResponse.json({ ok: true, id: created.id });
}
