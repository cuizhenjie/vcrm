"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

const MATCH_LABEL: Record<string, string> = { positive: "有意向", negative: "无意向", default: "未表态" };
const MATCH_TAG: Record<string, string> = { positive: "bg-green-50 text-ok", negative: "bg-red-50 text-danger", default: "bg-gray-100 text-gray-500" };
const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("zh-CN") : "—");

export default function ReportsPage() {
  const [tab, setTab] = useState<"delivery" | "mo">("delivery");
  const [delivery, setDelivery] = useState<any[]>([]);
  const [mo, setMo] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [moFilter, setMoFilter] = useState("");

  const loadDelivery = async () => {
    setLoading(true);
    const r = await fetch("/api/delivery-reports").then((r) => r.json());
    setDelivery(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  const loadMo = async () => {
    setLoading(true);
    const r = await fetch(`/api/mo-messages${moFilter ? `?matched=${moFilter}` : ""}`).then((r) => r.json());
    setMo(Array.isArray(r) ? r : []);
    setLoading(false);
  };

  useEffect(() => {
    if (tab === "delivery") loadDelivery();
    else loadMo();
  }, [tab, moFilter]);

  return (
    <>
      <Topbar title="消息回执" sub="送达状态报告 · 上行回复查看" />
      <div className="p-4 md:p-6 space-y-4 reveal">
        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "delivery" ? "bg-primary text-white" : "bg-white border border-line text-ink2 hover:border-accent"}`}
            onClick={() => setTab("delivery")}
          >送达回执（{delivery.length}）</button>
          <button
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === "mo" ? "bg-primary text-white" : "bg-white border border-line text-ink2 hover:border-accent"}`}
            onClick={() => setTab("mo")}
          >上行回复（{mo.length}）</button>
        </div>

        {tab === "mo" && (
          <select className="input w-40" value={moFilter} onChange={(e) => setMoFilter(e.target.value)}>
            <option value="">全部意图</option>
            <option value="positive">有意向</option>
            <option value="negative">无意向</option>
            <option value="default">未表态</option>
          </select>
        )}

        <div className="card overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full">
            {tab === "delivery" ? (
              <>
                <thead><tr><th className="th">时间</th><th className="th">手机号</th><th className="th">状态</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td className="td text-ink3" colSpan={3}>加载中…</td></tr>
                  ) : delivery.length === 0 ? (
                    <tr><td className="td text-ink3" colSpan={3}>暂无送达回执（需配置通道回调）</td></tr>
                  ) : delivery.map((r) => (
                    <tr key={r.id}>
                      <td className="td text-ink3">{fmt(r.reportedAt)}</td>
                      <td className="td font-mono">{r.recipient?.mobile ?? "—"}</td>
                      <td className="td"><Tag s={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead><tr><th className="th">时间</th><th className="th">手机号</th><th className="th">回复内容</th><th className="th">意图</th></tr></thead>
                <tbody>
                  {loading ? (
                    <tr><td className="td text-ink3" colSpan={4}>加载中…</td></tr>
                  ) : mo.length === 0 ? (
                    <tr><td className="td text-ink3" colSpan={4}>暂无上行回复（需配置通道回调）</td></tr>
                  ) : mo.map((m) => (
                    <tr key={m.id}>
                      <td className="td text-ink3">{fmt(m.receivedAt)}</td>
                      <td className="td font-mono">{m.mobile}</td>
                      <td className="td max-w-md truncate">{m.content}</td>
                      <td className="td"><span className={`tag ${MATCH_TAG[m.matchedAttr] ?? MATCH_TAG.default}`}>{MATCH_LABEL[m.matchedAttr] ?? m.matchedAttr}</span></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table></div>
        </div>
      </div>
    </>
  );
}
