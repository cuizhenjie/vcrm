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
  const rollout = async (force = false) => {
    setSending(true);
    const r = await fetch(`/api/campaigns/${params.id}/rollout`, { method: "POST", body: JSON.stringify({ force }) }).then((r) => r.json());
    if (r.error && !r.canForce) alert(r.error);
    setSending(false); setTimeout(load, 800);
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
      <Topbar title={campaign.name} sub={campaign.scheduledAt ? `定时：${new Date(campaign.scheduledAt).toLocaleString("zh-CN")}` : "任务详情"}>
        <Tag s={campaign.status} />
        {["pending", "stopped"].includes(campaign.status) &&
          <button className="btn btn-pri ml-2" onClick={send} disabled={sending}>{sending ? "发送中…" : "开始发送"}</button>}
        {campaign.status === "scheduled" &&
          <button className="btn ml-2" onClick={send} disabled={sending}>立即发送</button>}
      </Topbar>
      <div className="p-6 space-y-5">
        {campaign.status === "scheduled" && (
          <div className="card p-4 border-l-4 border-l-primary text-sm text-ink2">
            ⏰ 已排期，将于 <b>{new Date(campaign.scheduledAt).toLocaleString("zh-CN")}</b> 自动发送
            {campaign.quietHours && <>（避扰时段顺延）</>}。调度器每分钟扫描一次。
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
          {metrics.map((m) => (
            <div key={m.k} className="card p-4">
              <div className="text-sm text-ink2 mb-2">{m.k}</div>
              <div className={`text-2xl font-bold leading-none ${m.c}`}>{m.v}</div>
              <div className="text-xs text-ink3 mt-1.5">{m.s}</div>
            </div>
          ))}
        </div>
        {data.rollout && (
          <div className="card p-5 border-l-4 border-l-primary">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-semibold mb-1">自动放量{data.campaign.rolledOut ? "（已放量）" : ""}</div>
                <div className="text-sm text-ink2">
                  测试组 {data.rollout.testSent}/{data.rollout.testTotal} 已发送 · 放量组 {data.rollout.rolloutTotal} 人待投
                  {data.rollout.winnerLabel && <> · 当前赢家 <b className="text-ok">变体 {data.rollout.winnerLabel}</b></>}
                </div>
                {data.rollout.reason && (
                  <div className={`text-xs mt-1 ${data.rollout.significant ? "text-ok" : "text-warn"}`}>
                    {data.rollout.significant ? "✓ " : "⚠ "}{data.rollout.reason}
                  </div>
                )}
              </div>
              {data.campaign.rolledOut ? (
                <span className="tag bg-green-50 text-ok">已放量赢家文案</span>
              ) : data.rollout.canRollout ? (
                data.rollout.significant ? (
                  <button className="btn btn-pri" onClick={() => rollout(false)} disabled={sending}>
                    放量到赢家（{data.rollout.rolloutTotal} 人）
                  </button>
                ) : (
                  <button className="btn" onClick={() => { if (confirm("差异未达统计显著，仍要放量？可能选中假赢家。")) rollout(true); }} disabled={sending}>
                    仍要放量（不显著）
                  </button>
                )
              ) : (
                <span className="text-sm text-ink3">测试阶段发送完成后可放量</span>
              )}
            </div>
          </div>
        )}
        {data.variantStats?.length > 0 && (
          <div className="card p-5">
            <div className="font-semibold mb-4">A/B 测试结果 <span className="text-xs text-ink3 font-normal">点击率 = 点击 / 发送，绿色为当前领先</span></div>
            <div className="space-y-3">
              {data.variantStats.map((v: any) => {
                const win = v.id === data.winnerId;
                const ctr = Math.round(v.ctr * 100);
                return (
                  <div key={v.id} className="flex items-center gap-3">
                    <span className={`w-7 h-7 rounded-full text-sm font-bold flex items-center justify-center shrink-0 ${win ? "bg-ok text-white" : "bg-primary/10 text-primary"}`}>{v.label}</span>
                    <div className="w-40 shrink-0">
                      <div className="text-sm font-medium truncate">{v.template}</div>
                      <div className="text-xs text-ink3">发送 {v.sent} · 点击 {v.visited}</div>
                    </div>
                    <div className="flex-1 bg-gray-100 rounded h-7 overflow-hidden">
                      <div className={`h-full rounded flex items-center px-2 text-white text-xs font-medium transition-all ${win ? "bg-ok" : "bg-primary"}`}
                        style={{ width: `${Math.max(ctr, ctr ? 8 : 0)}%` }}>{ctr}%</div>
                    </div>
                    {win && <span className="tag bg-green-50 text-ok shrink-0">领先</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="card p-5">
          <div className="font-semibold mb-4">转化漏斗</div>
          <div className="space-y-2.5">
            {[
              { k: "发送成功", v: stats.sent, c: "bg-ok" },
              { k: "送达", v: stats.delivered, c: "bg-accent" },
              { k: "短链点击", v: stats.visited, c: "bg-primary" },
              { k: "产生意向", v: data.intent ?? 0, c: "bg-warn" },
            ].map((f) => (
              <div key={f.k} className="flex items-center gap-3">
                <div className="w-20 text-sm text-ink2 shrink-0">{f.k}</div>
                <div className="flex-1 bg-gray-100 rounded h-7 overflow-hidden">
                  <div className={`h-full ${f.c} rounded flex items-center px-2 text-white text-xs font-medium transition-all`}
                    style={{ width: `${Math.max(stats.sent ? (f.v / stats.sent) * 100 : 0, f.v ? 6 : 0)}%` }}>{f.v}</div>
                </div>
                <div className="w-14 text-sm text-ink3 text-right">{stats.sent ? Math.round((f.v / stats.sent) * 100) : 0}%</div>
              </div>
            ))}
          </div>
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
