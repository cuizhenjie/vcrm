"use client";
import { useEffect, useState, useCallback } from "react";
import { Topbar, Tag } from "@/components/ui";

const money = (n?: number | null) =>
  n == null ? "—" : `¥${n.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signedMoney = (n?: number | null) =>
  n == null ? "—" : `${n < 0 ? "-" : ""}¥${Math.abs(n).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n?: number | null) => (n == null ? "—" : Math.round(n * 100) + "%");

export default function CampaignDetail({ params }: { params: { id: string } }) {
  const [data, setData] = useState<any>(null);
  const [sending, setSending] = useState(false);
  const [rtAudience, setRtAudience] = useState("intent");
  const [rtTpl, setRtTpl] = useState("");
  const [tpls, setTpls] = useState<any[]>([]);
  const load = useCallback(() => fetch(`/api/campaigns/${params.id}`).then((r) => r.json()).then(setData), [params.id]);
  const terminal = data?.campaign?.status === "done" || data?.campaign?.status === "stopped";
  useEffect(() => {
    load();
    if (terminal) return; // 终态(已完成/已停止)不再轮询，省去重复 funnel/roi 查询
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [load, terminal]);
  useEffect(() => { fetch("/api/templates").then((r) => r.json()).then((d) => setTpls(d.filter((t: any) => t.reportStatus === "approved"))); }, []);
  // ⚠ 所有 hooks 必须在任何 early return 之前声明，否则违反 React Hooks 顺序规则
  if (!data?.campaign) return <div className="p-6 text-ink3">加载中…</div>;
  const { campaign, stats } = data;

  const send = async () => {
    setSending(true);
    await fetch(`/api/campaigns/${params.id}/send`, { method: "POST" });
    setTimeout(load, 800);
  };
  const retarget = async () => {
    if (!rtTpl) return alert("请选择再营销文案");
    setSending(true);
    const r = await fetch("/api/campaigns", { method: "POST", body: JSON.stringify({
      name: `${campaign.name}·再营销`, type: "text_sms", templateId: rtTpl,
      source: { fromCampaignId: params.id, audience: rtAudience },
    }) }).then((r) => r.json());
    setSending(false);
    if (r.error) return alert(r.error);
    window.location.href = `/campaigns/${r.id}`;
  };
  const stop = async () => {
    if (!confirm("确定停止该任务？已发送的不可撤回，未发送的将不再发送。")) return;
    setSending(true);
    await fetch(`/api/campaigns/${params.id}/stop`, { method: "POST" });
    setSending(false); setTimeout(load, 600);
  };
  const rollout = async (force = false) => {
    setSending(true);
    const r = await fetch(`/api/campaigns/${params.id}/rollout`, { method: "POST", body: JSON.stringify({ force }) }).then((r) => r.json());
    if (r.error && !r.canForce) alert(r.error);
    setSending(false); setTimeout(load, 800);
  };
  const rate = (n: number) => (stats.total ? Math.round((n / stats.total) * 100) : 0);
  const maxFunnel = Math.max(1, ...(data.funnel ?? []).map((f: any) => f.count));
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
        {["sending", "pending", "scheduled"].includes(campaign.status) &&
          <button className="btn ml-2" onClick={stop} disabled={sending}>停止任务</button>}
        <a className="btn ml-2" href={`/api/campaigns/${params.id}/export`}>导出明细</a>
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
        {data.roi && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">活动营收</div>
              <div className="text-2xl font-bold text-ok leading-none">{money(data.roi.revenue)}</div>
              <div className="text-xs text-ink3 mt-1.5">成交 {data.roi.wonCount} 单</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">活动成本</div>
              <div className="text-2xl font-bold text-primary leading-none">{money(data.roi.cost)}</div>
              <div className="text-xs text-ink3 mt-1.5">已发送 × {money(data.roi.unitCost)}</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">活动利润</div>
              <div className={`text-2xl font-bold leading-none ${data.roi.profit >= 0 ? "text-ok" : "text-danger"}`}>{signedMoney(data.roi.profit)}</div>
              <div className="text-xs text-ink3 mt-1.5">营收 − 成本</div>
            </div>
            <div className="card p-4">
              <div className="text-sm text-ink2 mb-2">活动 ROI</div>
              <div className={`text-2xl font-bold leading-none ${data.roi.roi == null || data.roi.roi >= 0 ? "text-primary" : "text-danger"}`}>{pct(data.roi.roi)}</div>
              <div className="text-xs text-ink3 mt-1.5">ROAS {data.roi.roas == null ? "—" : `${data.roi.roas.toFixed(2)}x`}</div>
            </div>
          </div>
        )}
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
          <div className="font-semibold mb-1">转化漏斗</div>
          <div className="text-xs text-ink3 mb-4">口径与数据中心一致：触及的最深档 · 环比=相对上一档，总转化=相对发送</div>
          <div className="space-y-3">
            {(data.funnel ?? []).map((f: any, idx: number) => (
              <div key={f.key} className="grid grid-cols-[56px_1fr_140px] gap-3 items-center">
                <div>
                  <div className="text-sm font-medium">{f.label}</div>
                  <div className="text-xs text-ink3">第{idx + 1}档</div>
                </div>
                <div className="h-8 bg-gray-100 rounded overflow-hidden">
                  <div className="h-full bg-primary rounded flex items-center px-2 text-white text-xs font-medium transition-all"
                    style={{ width: `${Math.max((f.count / maxFunnel) * 100, f.count ? 5 : 0)}%` }}>{f.count}</div>
                </div>
                <div className="text-xs text-ink3">
                  <div>环比 <b className="text-ink2">{idx === 0 ? "—" : pct(f.stepRate)}</b></div>
                  <div>总转化 <b className="text-ink2">{pct(f.totalRate)}</b></div>
                </div>
              </div>
            ))}
            {(data.funnel ?? []).length === 0 && <div className="text-sm text-ink3">暂无漏斗数据</div>}
          </div>
        </div>
        {data.audiences && stats.sent > 0 && (
          <div className="card p-5 border-l-4 border-l-accent">
            <div className="font-semibold mb-1">再营销 <span className="text-xs text-ink3 font-normal">从本次响应人群圈出温热客户，二次触达提转化</span></div>
            <div className="grid md:grid-cols-3 gap-2.5 my-3">
              {Object.entries(data.audiences).map(([key, a]: any) => (
                <button key={key} onClick={() => setRtAudience(key)}
                  className={`text-left p-3 rounded-lg border transition ${rtAudience === key ? "border-accent bg-blue-50/50" : "border-line"}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{a.label}</span>
                    <span className="text-lg font-bold text-accent">{a.count}</span>
                  </div>
                  <div className="text-xs text-ink3 mt-0.5">{a.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select className="input !w-auto flex-1 min-w-[180px]" value={rtTpl} onChange={(e) => setRtTpl(e.target.value)}>
                <option value="">选择再营销文案（可换更有针对性的）</option>
                {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button className="btn btn-pri" onClick={retarget} disabled={sending || !(data.audiences[rtAudience]?.count)}>
                创建再营销活动（{data.audiences[rtAudience]?.count ?? 0} 人）
              </button>
            </div>
          </div>
        )}
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
