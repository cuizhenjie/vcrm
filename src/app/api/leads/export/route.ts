import { NextRequest, NextResponse } from "next/server";
import { FOLLOW_LABELS, listLeadsForExport } from "@/lib/leads";

export const dynamic = "force-dynamic";

// CSV 单元格转义：
// 1) 防公式注入——客户回复/备注/姓名等可由外部输入，以 = + - @ 等开头会被
//    Excel/WPS 当公式执行，前置 ' 中和；
// 2) 含逗号/双引号/换行时整体加引号，内部双引号翻倍(RFC4180)。
function cell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const row = (values: unknown[]) => values.map(cell).join(",");

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString("zh-CN") : "");

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const leads = await listLeadsForExport({ intent: sp.get("intent"), status: sp.get("status"), q: sp.get("q") });

  const header = ["客户姓名", "手机号", "来源活动", "意图标签", "跟进状态", "成交额(元)", "跟进备注", "跟进时间", "最新回复", "回复时间", "短链点击", "发送状态", "线索时间"];
  const lines = leads.map((l) =>
    row([
      l.customerName ?? "",
      l.mobile,
      l.campaignName,
      l.intentTag,
      FOLLOW_LABELS[l.followStatus],
      l.dealValue ?? "",
      l.followNote ?? "",
      fmt(l.followedAt),
      l.latestReply?.content ?? "",
      fmt(l.latestReply?.receivedAt ?? null),
      l.visited ? "是" : "否",
      l.sendStatus,
      fmt(l.createdAt),
    ]),
  );

  const csv = "﻿" + [row(header), ...lines].join("\n"); // BOM 防 Excel 中文乱码
  const pretty = encodeURIComponent("线索池-导出.csv");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads.csv"; filename*=UTF-8''${pretty}`,
    },
  });
}
