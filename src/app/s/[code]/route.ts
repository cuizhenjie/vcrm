import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emitOutboundEvent } from "@/lib/events";
import { isAllowedRedirectHost } from "@/lib/redirect-guard";

export async function GET(_: NextRequest, { params }: { params: { code: string } }) {
  const link = await db.shortLink.findUnique({ where: { code: params.code } });
  if (!link) return new NextResponse("链接不存在", { status: 404 });

  // 开放重定向防护：仅允许跳转到白名单 host（防止官方短链域名被用作钓鱼跳板）
  if (!isAllowedRedirectHost(link.targetUrl)) {
    return new NextResponse("该链接目标不在允许列表内", { status: 403 });
  }

  await db.shortLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
  if (link.trackId) {
    await db.recipient.update({ where: { id: link.trackId }, data: { visited: true } }).catch(() => {});
    await emitOutboundEvent("message.clicked", { recipientId: link.trackId, shortCode: link.code }, link.tenantId).catch(() => {});
  }
  return NextResponse.redirect(link.targetUrl);
}
