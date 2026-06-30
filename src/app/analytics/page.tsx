"use client";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/ui";
import Link from "next/link";

const FOLLOW_LABELS: Record<string, string> = { new: "待跟进", following: "跟进中", won: "已成交", lost: "已流失" };
const pct = (n: number) => Math.round(n * 100) + "%";
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("zh-CN") : "—");
const money = (n?: number | null) =>
  n == null ? "—" : `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (n?: number | null) =>
  n == null ? "—" : `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ratioPct = (n?: number | null) => (n == null ? "—" : Math.round(n * 100) + "%");
const multiple = (n?: number | null) => (n == null ? "—" : `${n.toFixed(2)}x`);
const logTitle = (log: any) =>
  log.fromStatus && log.toStatus
    ? `${FOLLOW_LABELS[log.fromStatus] ?? log.fromStatus} → ${FOLLOW_LABELS[log.toStatus] ?? log.toStatus}`
    : "更新备注";

export default function Analytics() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/analytics").then((r) => r.json()).then(setD); }, []);
  if (!d) return <div className="p-6 text-ink3">加载中…</div>;
  const { summary, days, topCampaigns, funnel = [], recentFollowLogs = [], roi } = d;
  const maxSent = Math.max(1, ...days.map((x: any) => x.sent));
  const maxFunnel = Math.max(1, ...funnel.map((x: any) => x.count));
  const cards = [
    { k: "有效客户", v: summary.totalCustomers },
    { k: "触达任务", v: summary.totalCampaigns },
    { k: "累计发送", v: summary.totalSent },
    { k: "累计点击", v: summary.totalVisited },
    { k: "整体点击率", v: Math.round(summary.overallCtr * 100) + "%" },
  ];
  return (
    <>
      <Topbar title="数据中心" sub="组织级转化概览" />
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {cards.map((c) => (
            <div key={c.k} className="card p-4">
              <div className="text-sm text-ink2 mb-2">{c.k}</div>
              <div className="text-2xl font-bold text-primary leading-none">{c.v}</div>
            </div>
          ))}
        </div>

        {roi && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5">
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">成交营收</div>
              <div className="text-2xl font-bold text-ok leading-none">{money(roi.revenue)}</div>
              <div className="text-xs text-ink3 mt-1.5">成交 {roi.wonCount} 单</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">短信成本</div>
              <div className="text-2xl font-bold text-primary leading-none">{money(roi.cost)}</div>
              <div className="text-xs text-ink3 mt-1.5">单价 {money(roi.unitCost)}/条</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">利润</div>
              <div className={`text-2xl font-bold leading-none ${roi.profit >= 0 ? "text-ok" : "text-danger"}`}>{signedMoney(roi.profit)}</div>
              <div className="text-xs text-ink3 mt-1.5">营收 − 成本</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">ROI</div>
              <div className={`text-2xl font-bold leading-none ${roi.roi == null || roi.roi >= 0 ? "text-primary" : "text-danger"}`}>{ratioPct(roi.roi)}</div>
              <div className="text-xs text-ink3 mt-1.5">ROAS {multiple(roi.roas)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">客单价</div>
              <div className="text-2xl font-bold text-primary leading-none">{money(roi.avgDeal)}</div>
              <div className="text-xs text-ink3 mt-1.5">营收 / 成交</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">获客成本</div>
              <div className="text-2xl font-bold text-primary leading-none">{money(roi.cac)}</div>
              <div className="text-xs text-ink3 mt-1.5">成本 / 成交</div>
            </div>
          </div>
        )}

        <div className="card p-5">
          <div className="font-semibold mb-4">近 14 天发送 / 点击趋势</div>
          <div className="flex items-end gap-1.5 h-40">
            {days.map((day: any) => (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-1 group">
                <div className="w-full flex flex-col justify-end items-center relative" style={{ height: "130px" }}>
                  <div className="w-full bg-primary/20 rounded-t relative" style={{ height: `${(day.sent / maxSent) * 100}%` }}>
                    <div className="absolute bottom-0 left-0 right-0 bg-primary rounded-t" style={{ height: `${day.sent ? (day.clicks / day.sent) * 100 : 0}%` }} />
                  </div>
                  <div className="absolute -top-5 text-[10px] text-ink3 opacity-0 group-hover:opacity-100">{day.sent}发/{day.clicks}点</div>
                </div>
                <div className="text-[10px] text-ink3">{day.date}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-4 mt-3 text-xs text-ink3">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary/20 inline-block" />发送</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-primary inline-block" />点击</span>
          </div>
        </div>

        <div className="card p-5">
          <div className="font-semibold mb-1">组织级转化漏斗</div>
          <div className="text-xs text-ink3 mb-4">口径：触及的最深档（回复即代表已触及）· 环比=相对上一档，总转化=相对发送</div>
          <div className="space-y-3">
            {funnel.map((f: any, idx: number) => (
              <div key={f.key} className="grid grid-cols-[56px_1fr_140px] gap-3 items-center">
                <div>
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-xs text-ink3">第{idx + 1}档</div>
                </div>
                <div className="h-8 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-primary rounded flex items-center px-2 text-white text-xs font-medium transition-all"
                    style={{ width: `${Math.max((f.count / maxFunnel) * 100, f.count ? 5 : 0)}%` }}
                  >
                    {f.count}
                  </div>
                </div>
                <div className="text-xs text-ink3">
                  <div>环比 <b className="text-ink2">{idx === 0 ? "—" : pct(f.stepRate)}</b></div>
                  <div>总转化 <b className="text-ink2">{pct(f.totalRate)}</b></div>
                </div>
              </div>
            ))}
            {funnel.length === 0 && <div className="text-sm text-ink3">暂无数据</div>}
          </div>
        </div>

        <div className="card overflow-x-auto">
          <div className="font-semibold p-5 pb-3">活动 ROI 排行</div>
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">活动</th><th className="th">发送</th><th className="th">点击率</th><th className="th">成交</th><th className="th">营收</th><th className="th">成本</th><th className="th">ROI</th><th className="th"></th></tr></thead>
            <tbody>
              {topCampaigns.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="td font-medium">{c.name}</td>
                  <td className="td">{c.sent}</td>
                  <td className="td"><b className="text-primary">{Math.round(c.ctr * 100)}%</b></td>
                  <td className="td">{c.wonCount}</td>
                  <td className="td">{money(c.revenue)}</td>
                  <td className="td text-ink3">{money(c.cost)}</td>
                  <td className="td"><b className={c.roi == null || c.roi >= 0 ? "text-primary" : "text-danger"}>{ratioPct(c.roi)}</b></td>
                  <td className="td"><Link href={`/campaigns/${c.id}`} className="text-accent">详情</Link></td>
                </tr>
              ))}
              {topCampaigns.length === 0 && <tr><td className="td text-ink3" colSpan={8}>暂无已发送活动</td></tr>}
            </tbody>
          </table>
        </div>

        <div className="card p-5">
          <div className="font-semibold mb-4">最近跟进动态</div>
          <div className="space-y-3">
            {recentFollowLogs.map((log: any) => (
              <div key={log.id} className="flex items-start justify-between gap-3 border-b border-line/60 pb-3 last:border-0 last:pb-0">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">
                    {log.recipient.customerName ?? log.recipient.mobile}
                    <span className="text-ink3 font-normal"> · {log.recipient.campaignName}</span>
                  </div>
                  <div className="text-sm text-ink2 mt-0.5">{logTitle(log)}</div>
                  {log.note !== null && <div className="text-xs text-ink3 mt-1 whitespace-pre-line">{log.note || "（清空）"}</div>}
                </div>
                <div className="text-right text-xs text-ink3 shrink-0">
                  <div>{log.actor}</div>
                  <div>{fmt(log.createdAt)}</div>
                </div>
              </div>
            ))}
            {recentFollowLogs.length === 0 && <div className="text-sm text-ink3">暂无跟进动态</div>}
          </div>
        </div>
      </div>
    </>
  );
}
