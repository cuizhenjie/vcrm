"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

const INTENT_LABEL: Record<string, string> = { positive: "有意向", negative: "无意向", unsubscribe: "退订" };
const INTENT_TAG: Record<string, string> = { positive: "bg-green-50 text-ok", negative: "bg-red-50 text-danger", unsubscribe: "bg-amber-50 text-warn" };

export default function IntentKeywordsPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState("positive");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/intent-keywords").then((r) => r.json());
    setList(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const words = input.split(/[\n,，]/).map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/intent-keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: words.map((w) => ({ word: w, intent })) }),
    });
    const j = await r.json();
    setBusy(false);
    if (r.ok) { setMsg(`新增 ${j.added} 个`); setInput(""); load(); }
    else setMsg(j.error || "添加失败");
  };

  const toggle = async (id: string, cur: string) => {
    const status = cur === "active" ? "inactive" : "active";
    const r = await fetch(`/api/intent-keywords/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    if (!r.ok) { setMsg("操作失败"); return; }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("删除该词？")) return;
    const r = await fetch(`/api/intent-keywords/${id}`, { method: "DELETE" });
    if (!r.ok) { setMsg("删除失败"); return; }
    load();
  };

  return (
    <>
      <Topbar title="意图词库" sub="上行回复意图匹配 · 数据驱动（替代硬编码）" />
      <div className="p-4 md:p-6 space-y-5 reveal">
        <div className="card p-5">
          <div className="font-semibold mb-3">批量添加</div>
          <div className="flex gap-3 items-start flex-wrap">
            <textarea className="input flex-1 min-w-[260px] h-20" placeholder="每行一个词，或用逗号分隔"
              value={input} onChange={(e) => setInput(e.target.value)} />
            <div className="flex flex-col gap-2">
              <select className="input" value={intent} onChange={(e) => setIntent(e.target.value)}>
                <option value="positive">有意向</option>
                <option value="negative">无意向</option>
                <option value="unsubscribe">退订</option>
              </select>
              <button className="btn btn-pri" onClick={add} disabled={busy}>{busy ? "添加中…" : "添加"}</button>
            </div>
          </div>
          {msg && <div className="text-sm text-ink3 mt-2">{msg}</div>}
          <div className="text-xs text-ink3 mt-2">匹配优先级：退订 → 无意向 → 有意向。未命中则标&ldquo;未表态&rdquo;。DB 词优先于内置兜底词。</div>
        </div>

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">词库列表（{list.length}）</div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">关键词</th><th className="th">意图</th><th className="th">状态</th><th className="th">操作</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td className="td text-ink3" colSpan={4}>加载中…</td></tr>
              ) : list.length === 0 ? (
                <tr><td className="td text-ink3" colSpan={4}>暂无自定义意图词（使用内置兜底词）</td></tr>
              ) : list.map((w) => (
                <tr key={w.id}>
                  <td className="td font-medium">{w.word}</td>
                  <td className="td"><span className={`tag ${INTENT_TAG[w.intent]}`}>{INTENT_LABEL[w.intent] ?? w.intent}</span></td>
                  <td className="td"><Tag s={w.status} /></td>
                  <td className="td">
                    <button className="text-xs text-accent hover:underline mr-2" onClick={() => toggle(w.id, w.status)}>{w.status === "active" ? "停用" : "启用"}</button>
                    <button className="text-xs text-danger hover:underline" onClick={() => del(w.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}
