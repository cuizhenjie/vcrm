"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

type FollowStatus = "new" | "following" | "won" | "lost";

interface Lead {
  id: string;
  mobile: string;
  customerName: string | null;
  campaignName: string;
  intentTag: string;
  followStatus: FollowStatus;
  dealValue: number | null;
  followNote: string | null;
  followedAt: string | null;
  assignedTo: string | null;
  nextFollowAt: string | null;
  followResult: string | null;
  visited: boolean;
  createdAt: string;
  latestReply: { content: string; matchedAttr: string | null; receivedAt: string } | null;
}

interface Counts {
  total: number;
  byStatus: Record<FollowStatus, number>;
  byIntent: { positive: number; negative: number; neutral: number };
}

interface FollowLog {
  id: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  actor: string;
  createdAt: string;
}

const FOLLOW_LABELS: Record<FollowStatus, string> = { new: "待跟进", following: "跟进中", won: "已成交", lost: "已流失" };
const RESULT_LABELS = ["", "interested", "no_answer", "invalid", "deal", "lost"];
const RESULT_TEXT: Record<string, string> = { interested: "有意向", no_answer: "未接通", invalid: "无效", deal: "成交", lost: "流失" };
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("zh-CN") : "—");
const toLocalInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
};
const logTitle = (log: FollowLog) =>
  log.fromStatus && log.toStatus
    ? `${FOLLOW_LABELS[log.fromStatus as FollowStatus] ?? log.fromStatus} → ${FOLLOW_LABELS[log.toStatus as FollowStatus] ?? log.toStatus}`
    : "更新备注";

export default function LeadsPage() {
  const [rows, setRows] = useState<Lead[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [intent, setIntent] = useState("all");
  const [status, setStatus] = useState("all");
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [deals, setDeals] = useState<Record<string, string>>({});
  const [owners, setOwners] = useState<Record<string, string>>({});
  const [nextTimes, setNextTimes] = useState<Record<string, string>>({});
  const [logLead, setLogLead] = useState<Lead | null>(null);
  const [logs, setLogs] = useState<FollowLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const params = useCallback(
    (withPage: boolean) => {
      const p = new URLSearchParams();
      if (intent !== "all") p.set("intent", intent);
      if (status !== "all") p.set("status", status);
      if (q) p.set("q", q);
      if (withPage) p.set("page", String(page));
      return p;
    },
    [intent, status, q, page],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/leads?${params(true).toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载失败");
      setRows(data.items ?? []);
      setCounts(data.counts ?? null);
      setTotal(data.total ?? 0);
      setTotalPages(data.totalPages ?? 1);
      setNotes(Object.fromEntries((data.items ?? []).map((r: Lead) => [r.id, r.followNote ?? ""])));
      setDeals(Object.fromEntries((data.items ?? []).map((r: Lead) => [r.id, r.dealValue == null ? "" : String(r.dealValue)])));
      setOwners(Object.fromEntries((data.items ?? []).map((r: Lead) => [r.id, r.assignedTo ?? ""])));
      setNextTimes(Object.fromEntries((data.items ?? []).map((r: Lead) => [r.id, toLocalInput(r.nextFollowAt)])));
    } catch (e) {
      alert(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { load(); }, [load]);

  const exportHref = useMemo(() => `/api/leads/export?${params(false).toString()}`, [params]);

  const patch = async (id: string, body: {
    followStatus?: string;
    followNote?: string;
    dealValue?: number | null;
    assignedTo?: string;
    nextFollowAt?: string | null;
    followResult?: string | null;
  }) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "更新失败");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "更新失败");
    } finally {
      setSaving(null);
    }
  };

  const saveNote = (lead: Lead) => {
    const next = (notes[lead.id] ?? "").trim();
    if (next === (lead.followNote ?? "")) return;
    void patch(lead.id, { followNote: next });
  };

  const saveDeal = (lead: Lead) => {
    const raw = (deals[lead.id] ?? "").trim();
    const next = raw === "" ? null : Number(raw);
    if (next !== null && (!Number.isFinite(next) || next < 0)) {
      alert("成交金额需为大于等于 0 的数字");
      setDeals((m) => ({ ...m, [lead.id]: lead.dealValue == null ? "" : String(lead.dealValue) }));
      return;
    }
    const rounded = next === null ? null : Math.round((next + Number.EPSILON) * 100) / 100;
    if (rounded === (lead.dealValue ?? null)) return;
    void patch(lead.id, { dealValue: rounded });
  };

  const saveOwner = (lead: Lead) => {
    const next = (owners[lead.id] ?? "").trim();
    if (next === (lead.assignedTo ?? "")) return;
    void patch(lead.id, { assignedTo: next });
  };

  const saveNextTime = (lead: Lead) => {
    const next = (nextTimes[lead.id] ?? "").trim();
    if (next === toLocalInput(lead.nextFollowAt)) return;
    void patch(lead.id, { nextFollowAt: next || null });
  };

  const search = (e: React.FormEvent) => { e.preventDefault(); setPage(1); setQ(qInput.trim()); };
  const reset = () => { setIntent("all"); setStatus("all"); setQ(""); setQInput(""); setPage(1); };

  const openLogs = async (lead: Lead) => {
    setLogLead(lead);
    setLogs([]);
    setLogsLoading(true);
    try {
      const res = await fetch(`/api/leads/logs?recipientId=${encodeURIComponent(lead.id)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "加载历史失败");
      setLogs(data.logs ?? []);
    } catch (e) {
      alert(e instanceof Error ? e.message : "加载历史失败");
    } finally {
      setLogsLoading(false);
    }
  };

  const summary: { k: string; v: number; cls: string; s: string }[] = counts
    ? [
        { k: "全部线索", v: counts.total, cls: "text-primary", s: "有上行意图" },
        { k: "待跟进", v: counts.byStatus.new, cls: "text-warn", s: "销售优先处理" },
        { k: "跟进中", v: counts.byStatus.following, cls: "text-accent", s: "已有动作" },
        { k: "已成交", v: counts.byStatus.won, cls: "text-ok", s: "转化结果" },
        { k: "有意向", v: counts.byIntent.positive, cls: "text-ok", s: "最高优先级" },
      ]
    : [];

  return (
    <>
      <Topbar title="线索池" sub="互动收件箱 · 上行回复转化跟进">
        <a className="btn" href={exportHref}>导出 CSV</a>
      </Topbar>

      <div className="p-6 space-y-5">
        {counts && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
            {summary.map((c) => (
              <div key={c.k} className="card p-4">
                <div className="text-sm text-ink2 mb-2">{c.k}</div>
                <div className={`text-2xl font-bold leading-none ${c.cls}`}>{c.v}</div>
                <div className="text-xs text-ink3 mt-1.5">{c.s}</div>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={search} className="card p-4 flex flex-wrap items-center gap-3">
          <select className="input !w-auto min-w-[130px]" value={intent} onChange={(e) => { setIntent(e.target.value); setPage(1); }}>
            <option value="all">全部意图</option>
            <option value="positive">有意向</option>
            <option value="negative">无意向</option>
            <option value="default">未表态</option>
          </select>
          <select className="input !w-auto min-w-[130px]" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="all">全部状态</option>
            <option value="new">待跟进</option>
            <option value="following">跟进中</option>
            <option value="won">已成交</option>
            <option value="lost">已流失</option>
          </select>
          <input className="input flex-1 min-w-[200px]" placeholder="搜客户 / 手机号 / 活动 / 回复 / 备注" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          <button className="btn btn-pri" type="submit">搜索</button>
          <button className="btn" type="button" onClick={reset}>重置</button>
          <span className="text-sm text-ink3 ml-auto">{loading ? "加载中…" : `共 ${total} 条`}</span>
        </form>

        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1480px]">
            <thead>
              <tr>
                <th className="th">客户</th>
                <th className="th">手机号</th>
                <th className="th">来源活动</th>
                <th className="th">意图</th>
                <th className="th">最新回复</th>
                <th className="th">负责人</th>
                <th className="th">下次跟进</th>
                <th className="th">跟进状态</th>
                <th className="th">结果</th>
                <th className="th">成交额(元)</th>
                <th className="th">跟进备注</th>
                <th className="th">跟进时间</th>
                <th className="th">历史</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((lead) => (
                <tr key={lead.id} className="hover:bg-gray-50">
                  <td className="td font-medium">{lead.customerName ?? "—"}</td>
                  <td className="td">{lead.mobile}</td>
                  <td className="td max-w-[160px] truncate" title={lead.campaignName}>{lead.campaignName}</td>
                  <td className="td"><Tag s={lead.intentTag || "未表态"} /></td>
                  <td className="td">
                    <div className="max-w-[240px] truncate" title={lead.latestReply?.content ?? ""}>{lead.latestReply?.content ?? "—"}</div>
                    {lead.latestReply && <div className="text-xs text-ink3 mt-0.5">{fmt(lead.latestReply.receivedAt)}</div>}
                  </td>
                  <td className="td">
                    <input
                      className="input !h-8 !w-[96px]"
                      value={owners[lead.id] ?? ""}
                      placeholder="负责人"
                      disabled={saving === lead.id}
                      onChange={(e) => setOwners((m) => ({ ...m, [lead.id]: e.target.value }))}
                      onBlur={() => saveOwner(lead)}
                    />
                  </td>
                  <td className="td">
                    <input
                      type="datetime-local"
                      className="input !h-8 !w-[170px]"
                      value={nextTimes[lead.id] ?? ""}
                      disabled={saving === lead.id}
                      onChange={(e) => setNextTimes((m) => ({ ...m, [lead.id]: e.target.value }))}
                      onBlur={() => saveNextTime(lead)}
                    />
                  </td>
                  <td className="td">
                    <select
                      className="input !h-8 !w-[104px]"
                      value={lead.followStatus}
                      disabled={saving === lead.id}
                      onChange={(e) => patch(lead.id, { followStatus: e.target.value })}
                    >
                      {(Object.keys(FOLLOW_LABELS) as FollowStatus[]).map((v) => (
                        <option key={v} value={v}>{FOLLOW_LABELS[v]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="td">
                    <select
                      className="input !h-8 !w-[96px]"
                      value={lead.followResult ?? ""}
                      disabled={saving === lead.id}
                      onChange={(e) => patch(lead.id, { followResult: e.target.value || null })}
                    >
                      {RESULT_LABELS.map((v) => <option key={v} value={v}>{v ? RESULT_TEXT[v] ?? v : "—"}</option>)}
                    </select>
                  </td>
                  <td className="td">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input !h-8 !w-[110px]"
                      value={deals[lead.id] ?? ""}
                      placeholder="0.00"
                      disabled={saving === lead.id}
                      onChange={(e) => setDeals((m) => ({ ...m, [lead.id]: e.target.value }))}
                      onBlur={() => saveDeal(lead)}
                    />
                  </td>
                  <td className="td">
                    <input
                      className="input !h-8 min-w-[160px]"
                      value={notes[lead.id] ?? ""}
                      placeholder="跟进备注"
                      disabled={saving === lead.id}
                      onChange={(e) => setNotes((m) => ({ ...m, [lead.id]: e.target.value }))}
                      onBlur={() => saveNote(lead)}
                    />
                  </td>
                  <td className="td text-ink3">{fmt(lead.followedAt)}</td>
                  <td className="td"><button type="button" className="btn !h-8 !px-3" onClick={() => openLogs(lead)}>历史</button></td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td className="td text-ink3" colSpan={13}>{loading ? "加载中…" : "暂无线索 — 客户上行回复命中意图后会出现在这里"}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button className="btn" disabled={page <= 1 || loading} onClick={() => setPage((p) => Math.max(1, p - 1))}>上一页</button>
          <span className="text-sm text-ink3">第 {page} / {totalPages} 页</span>
          <button className="btn" disabled={page >= totalPages || loading} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>下一页</button>
        </div>

        {logLead && (
          <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setLogLead(null)}>
            <div className="card w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b border-line flex items-center justify-between">
                <div>
                  <div className="font-semibold">跟进历史</div>
                  <div className="text-sm text-ink3">{logLead.customerName ?? logLead.mobile} · {logLead.campaignName}</div>
                </div>
                <button type="button" className="btn" onClick={() => setLogLead(null)}>关闭</button>
              </div>
              <div className="p-5 overflow-y-auto space-y-3">
                {logsLoading && <div className="text-sm text-ink3">加载中…</div>}
                {!logsLoading && logs.length === 0 && <div className="text-sm text-ink3">暂无跟进记录</div>}
                {logs.map((log) => (
                  <div key={log.id} className="border-b border-line/60 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">{logTitle(log)}</div>
                      <div className="text-xs text-ink3 shrink-0">{fmt(log.createdAt)}</div>
                    </div>
                    <div className="text-xs text-ink3 mt-1">操作人：{log.actor}</div>
                    {log.note !== null && (
                      <div className="text-sm text-ink2 mt-2 bg-gray-50 rounded p-2 whitespace-pre-line">{log.note || "（清空）"}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
