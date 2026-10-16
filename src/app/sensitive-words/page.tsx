"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

const CATEGORIES = ["general", "fraud", "finance", "gambling", "medical", "commerce"];
const CATEGORY_LABEL: Record<string, string> = {
  general: "通用", fraud: "欺诈", finance: "金融", gambling: "赌博", medical: "医疗", commerce: "电商",
};

export default function SensitiveWordsPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [category, setCategory] = useState("general");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/sensitive-words").then((r) => r.json());
    setList(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    const words = input.split(/[\n,，]/).map((w) => w.trim()).filter(Boolean);
    if (words.length === 0) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/sensitive-words", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ words: words.map((w) => ({ word: w, category })) }),
    });
    const j = await r.json();
    setBusy(false);
    if (r.ok) {
      setMsg(`新增 ${j.added} 个，跳过已存在 ${j.skipped} 个`);
      setInput("");
      load();
    } else setMsg(j.error || "添加失败");
  };

  const toggle = async (id: string, cur: string) => {
    const status = cur === "active" ? "inactive" : "active";
    const r = await fetch(`/api/sensitive-words/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!r.ok) { setMsg("操作失败，请重试"); return; }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("删除该敏感词？")) return;
    const r = await fetch(`/api/sensitive-words/${id}`, { method: "DELETE" });
    if (!r.ok) { setMsg("删除失败，请重试"); return; }
    load();
  };

  const shown = list.filter((w) => !filter || w.word.includes(filter) || w.category === filter);

  return (
    <>
      <Topbar title="敏感词管理" sub="内容审核词库 · 命中即拦截发送" />
      <div className="p-4 md:p-6 space-y-5 reveal">
        <div className="card p-5">
          <div className="font-semibold mb-3">批量添加</div>
          <div className="flex gap-3 items-start flex-wrap">
            <textarea
              className="input flex-1 min-w-[260px] h-20"
              placeholder="每行一个词，或用逗号分隔"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex flex-col gap-2">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
              </select>
              <button className="btn btn-pri" onClick={add} disabled={busy}>{busy ? "添加中…" : "添加"}</button>
            </div>
          </div>
          {msg && <div className="text-sm text-ink3 mt-2">{msg}</div>}
        </div>

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3 flex items-center gap-3">
            <span>词库列表（{list.length}）</span>
            <input
              className="input ml-auto w-48"
              placeholder="搜索词/分类"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead>
              <tr>
                <th className="th">敏感词</th><th className="th">分类</th><th className="th">状态</th><th className="th">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="td text-ink3" colSpan={4}>加载中…</td></tr>
              ) : shown.length === 0 ? (
                <tr><td className="td text-ink3" colSpan={4}>暂无敏感词</td></tr>
              ) : shown.map((w) => (
                <tr key={w.id}>
                  <td className="td font-medium">{w.word}</td>
                  <td className="td"><span className="tag bg-gray-100 text-gray-500">{CATEGORY_LABEL[w.category] ?? w.category}</span></td>
                  <td className="td"><Tag s={w.status} /></td>
                  <td className="td">
                    <button className="text-xs text-accent hover:underline mr-3" onClick={() => toggle(w.id, w.status)}>
                      {w.status === "active" ? "停用" : "启用"}
                    </button>
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
