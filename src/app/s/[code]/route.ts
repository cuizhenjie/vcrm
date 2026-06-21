import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(_: NextRequest, { params }: { params: { code: string } }) {
  const link = await db.shortLink.findUnique({ where: { code: params.code } });
  if (!link) return new NextResponse("链接不存在", { status: 404 });

  await db.shortLink.update({ where: { id: link.id }, data: { clicks: { increment: 1 } } });
  if (link.trackId) {
    await db.recipient.update({ where: { id: link.trackId }, data: { visited: true } }).catch(() => {});
  }
  return NextResponse.redirect(link.targetUrl);
}
