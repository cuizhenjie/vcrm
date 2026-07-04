"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

const SOURCE_LABEL: Record<string, string> = {
  company: "公司名", product: "产品名", website: "网站", app: "APP", wechat: "公众号",
};

export default function SignaturesPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [source, setSource] = useState("company");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/signatures").then((r) => r.json());
    setList(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true); setMsg("");
    const r = await fetch("/api/signatures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ signName: name.trim(), source }),
    });
    const j = await r.json();
    setBusy(false);
    if (r.ok) { setMsg("已添加，状态为待审核"); setName(""); load(); }
    else setMsg(j.error || "添加失败");
  };

  const review = async (id: string, status: string, reason?: string) => {
    const body: any = { reportStatus: status };
    if (reason !== undefined) body.rejectReason = reason;
    const r = await fetch(`/api/signatures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) { setMsg("操作失败"); return; }
    load();
  };

  const setDefault = async (id: string) => {
    const r = await fetch(`/api/signatures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!r.ok) { setMsg("操作失败"); return; }
    load();
  };

  const del = async (id: string) => {
    if (!confirm("删除该签名？")) return;
    const r = await fetch(`/api/signatures/${id}`, { method: "DELETE" });
    if (!r.ok) { setMsg("删除失败"); return; }
    load();
  };

  return (
    <>
      <Topbar title="短信签名管理" sub="通道报备签名 · 审核状态流转" />
      <div className="p-6 space-y-5">
        <div className="card p-5">
          <div className="font-semibold mb-3">新增签名</div>
          <div className="flex gap-3 items-center flex-wrap">
            <input
              className="input flex-1 min-w-[200px]"
              placeholder="签名名称（如 三酷科技，无需【】）"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
            />
            <select className="input w-36" value={source} onChange={(e) => setSource(e.target.value)}>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <button className="btn btn-pri" onClick={add} disabled={busy}>{busy ? "添加中…" : "添加"}</button>
          </div>
          {msg && <div className="text-sm text-ink3 mt-2">{msg}</div>}
        </div>

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">签名列表（{list.length}）</div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">签名</th><th className="th">来源</th><th className="th">审核状态</th><th className="th">默认</th><th className="th">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="td text-ink3" colSpan={5}>加载中…</td></tr>
              ) : list.length === 0 ? (
                <tr><td className="td text-ink3" colSpan={5}>暂无签名</td></tr>
              ) : list.map((s) => (
                <tr key={s.id}>
                  <td className="td font-medium">【{s.signName}】</td>
                  <td className="td"><span className="tag bg-gray-100 text-gray-500">{SOURCE_LABEL[s.source] ?? s.source}</span></td>
                  <td className="td"><Tag s={s.reportStatus} /></td>
                  <td className="td">{s.isDefault ? <span className="tag bg-green-50 text-ok">默认</span> : "—"}</td>
                  <td className="td whitespace-nowrap">
                    {s.reportStatus === "pending" && (
                      <>
                        <button className="text-xs text-ok hover:underline mr-2" onClick={() => review(s.id, "approved")}>通过</button>
                        <button className="text-xs text-danger hover:underline mr-2" onClick={() => {
                          const reason = prompt("驳回原因：");
                          if (reason !== null) review(s.id, "rejected", reason);
                        }}>驳回</button>
                      </>
                    )}
                    {s.reportStatus !== "pending" && (
                      <button className="text-xs text-accent hover:underline mr-2" onClick={() => review(s.id, "pending")}>重审</button>
                    )}
                    {!s.isDefault && s.reportStatus === "approved" && (
                      <button className="text-xs text-primary hover:underline mr-2" onClick={() => setDefault(s.id)}>设默认</button>
                    )}
                    <button className="text-xs text-danger hover:underline" onClick={() => del(s.id)}>删除</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.some((s) => s.rejectReason) && (
            <div className="px-5 py-3 border-t border-line text-xs text-ink3">
              {list.filter((s) => s.rejectReason).map((s) => (
                <div key={s.id}>【{s.signName}】驳回原因：{s.rejectReason}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
