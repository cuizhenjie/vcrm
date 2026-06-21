"use client";
import { useEffect, useState, useCallback } from "react";
import { Topbar, Tag } from "@/components/ui";

export default function CampaignDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const load = useCallback(() => fetch(`/api/campaigns/${params.id}`).then((r) => r.json()).then(setData), [params.id]);
  useEffect(() => { load(); const t = setInterval(load, 2500); return () => clearInterval(t); }, [load]);
  if (!data?.campaign) return <div className="p-6 text-ink3">加载中…</div>;
  const { campaign, stats } = data;

  const send = async () => {
    setSending(true);
    await fetch(`/api/campaigns/${params.id}/send`, { method: "POST" });
    setTimeout(load, 800);
  };
  const rate = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const metrics = [
    { k: "发送成功", v: stats.sent, s: `${rate(stats.sent)}%`, c: "text-ok" },
    { k: "送达", v: stats.delivered, s: "回执确认", c: "text-accent" },
    { k: "短链点击", v: stats.visited, s: `${rate(stats.visited)}%`, c: "text-primary" },
    { k: "发送失败", v: stats.failed, s: "需重试", c: "text-danger" },
    { k: "风控过滤", v: stats.filtered, s: "黑名单/敏感", c: "text-warn" },
  ];
  return (
    <>
      <Topbar title={campaign.name} sub="任务详情">
        <Tag s={campaign.status} />
        {["pending", "stopped"].includes(campaign.status) &&
          <button className="btn btn-pri ml-2" onClick={send} disabled={sending}>{sending ? "发送中…" : "开始发送"}</button>}
      </Topbar>
      <div className="p-6 space-y-5">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {metrics.map((m) => (
            <div key={m.k} className="card p-4">
              <div className="text-sm text-ink2 mb-2">{m.k}</div>
              <div className={`text-2xl font-bold leading-none ${m.c}`}>{m.v}</div>
              <div className="text-xs text-ink3 mt-1.5">{m.s}</div>
            </div>
          ))}
        </div>
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="th">手机号</th><th className="th">流水号</th><th className="th">发送状态</th><th className="th">送达</th><th className="th">短链</th><th className="th">意图标签</th></tr></thead>
            <tbody>
              {campaign.recipients.map((r: any) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="td font-mono">{r.mobile}</td>
                  <td className="td text-ink3 font-mono text-xs">{r.extno}</td>
                  <td className="td"><Tag s={r.sendStatus} /></td>
                  <td className="td">{r.deliveryStatus === "delivered" ? <span className="tag bg-green-50 text-ok">已送达</span> : "—"}</td>
                  <td className="td">{r.visited ? <span className="text-accent">已点击</span> : "—"}</td>
                  <td className="td">{r.intentTag ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink3">提示：状态报告 / 上行回复通过 <code>/api/webhooks/delivery</code>、<code>/api/webhooks/mo</code> 回填；可用 curl 模拟回调测试（见 README）。</p>
      </div>
    </>
  );
}
