"use client";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/ui";
import Link from "next/link";

export default function Analytics() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch("/api/analytics").then((r) => r.json()).then(setD); }, []);
  if (!d) return <div className="p-6 text-ink3">加载中…</div>;
  const { summary, days, topCampaigns } = d;
  const maxSent = Math.max(1, ...days.map((x: any) => x.sent));
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

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">活动点击率排行</div>
          <table className="w-full">
            <thead><tr><th className="th">活动</th><th className="th">发送</th><th className="th">点击</th><th className="th">点击率</th><th className="th"></th></tr></thead>
            <tbody>
              {topCampaigns.map((c: any) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="td font-medium">{c.name}</td>
                  <td className="td">{c.sent}</td>
                  <td className="td">{c.visited}</td>
                  <td className="td"><b className="text-primary">{Math.round(c.ctr * 100)}%</b></td>
                  <td className="td"><Link href={`/campaigns/${c.id}`} className="text-accent">详情</Link></td>
                </tr>
              ))}
              {topCampaigns.length === 0 && <tr><td className="td text-ink3" colSpan={5}>暂无已发送活动</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
