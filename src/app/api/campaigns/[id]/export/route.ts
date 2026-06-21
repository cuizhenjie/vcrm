import { NextResponse } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: { id: string } }) {
  const c = await db.campaign.findUnique({ where: { id: params.id } });
  const recipients = await db.recipient.findMany({
    where: { campaignId: params.id }, include: { variant: true }, orderBy: { createdAt: "asc" },
  });
  const header = ["手机号", "发送状态", "送达", "短链点击", "意图标签", "A/B变体", "阶段", "流水号"];
  const lines = recipients.map((r) =>
    [r.mobile, r.sendStatus, r.deliveryStatus ?? "", r.visited ? "是" : "否", r.intentTag ?? "", r.variant?.label ?? "", r.phase, r.extno].join(","));
  const csv = "\uFEFF" + [header.join(","), ...lines].join("\n"); // BOM 防 Excel 中文乱码
  // 文件名含中文需 RFC5987 编码，HTTP 头不能直接放非 ASCII
  const safe = `campaign-${params.id}.csv`;
  const pretty = encodeURIComponent(`${c?.name ?? "活动"}-明细.csv`);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}"; filename*=UTF-8''${pretty}`,
    },
  });
}
