"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

type T = { id: string; name: string; type: string; content: string; landingUrl?: string | null; reportStatus: string; rejectReason?: string | null; signatureId?: string | null };

export default function Templates() {
  const [list, setList] = useState<T[]>([]);
  const [sigs, setSigs] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", type: "text", content: "", landingUrl: "", signatureId: "" });
  const [filter, setFilter] = useState("all");

  const load = () => {
    fetch("/api/templates").then((r) => r.json()).then(setList);
    fetch("/api/signatures").then((r) => r.json()).then((d) => setSigs(Array.isArray(d) ? d : []));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!form.name || !form.content) return;
    await fetch("/api/templates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setForm({ name: "", type: "text", content: "", landingUrl: "", signatureId: "" });
    load();
  };

  const act = async (id: string, action: string, extra?: any) => {
    const r = await fetch(`/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!r.ok) { const j = await r.json().catch(() => ({})); alert(j.error || "操作失败"); return; }
    load();
  };

  const filtered = list.filter((t) => filter === "all" || t.reportStatus === filter);

  return (
    <>
      <Topbar title="短信模板" sub="内容与话术 · 审核通过方可发送">
        <select className="input w-32" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">全部</option>
          <option value="draft">草稿</option>
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已驳回</option>
        </select>
      </Topbar>
      <div className="p-6 grid md:grid-cols-[340px_1fr] gap-5">
        <div className="card p-5 h-fit">
          <div className="font-semibold mb-3">新建模板</div>
          <input className="input mb-2.5" placeholder="模板名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input mb-2.5" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="text">文本短信</option><option value="mms">视频彩信</option><option value="flash">闪信</option>
          </select>
          <textarea className="input !h-24 py-2" placeholder="正文，支持变量：{name} {link} {自定义列}" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <input className="input mt-2.5" placeholder="落地页 URL（{link} 短链指向）" value={form.landingUrl} onChange={(e) => setForm({ ...form, landingUrl: e.target.value })} />
          <select className="input mt-2.5" value={form.signatureId} onChange={(e) => setForm({ ...form, signatureId: e.target.value })}>
            <option value="">默认签名</option>
            {sigs.filter((s) => s.reportStatus === "approved").map((s) => (
              <option key={s.id} value={s.id}>【{s.signName}】</option>
            ))}
          </select>
          <div className="text-xs text-ink3 mt-2">变量：<code>{"{name}"}</code>、<code>{"{link}"}</code>、<code>{"{列名}"}</code></div>
          <button className="btn btn-pri w-full mt-3" onClick={create}>提交审核</button>
        </div>
        <div className="card overflow-hidden h-fit">
          <table className="w-full">
            <thead>
              <tr><th className="th">名称</th><th className="th">类型</th><th className="th">内容</th><th className="th">状态</th><th className="th">操作</th></tr>
            </thead>
            <tbody>
              {filtered.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="td font-medium">{t.name}</td>
                  <td className="td"><Tag s={t.type} /></td>
                  <td className="td max-w-xs">
                    <div className="truncate text-ink2">{t.content}</div>
                    {t.rejectReason && <div className="text-xs text-danger mt-0.5">驳回：{t.rejectReason}</div>}
                  </td>
                  <td className="td"><Tag s={t.reportStatus} /></td>
                  <td className="td whitespace-nowrap">
                    {t.reportStatus === "pending" && (
                      <>
                        <button className="text-xs text-ok hover:underline mr-2" onClick={() => act(t.id, "approve")}>通过</button>
                        <button className="text-xs text-danger hover:underline mr-2" onClick={() => {
                          const reason = prompt("驳回原因："); if (reason !== null) act(t.id, "reject", { reason });
                        }}>驳回</button>
                      </>
                    )}
                    {(t.reportStatus === "rejected" || t.reportStatus === "approved") && (
                      <button className="text-xs text-accent hover:underline mr-2" onClick={() => act(t.id, "resubmit")}>重新提交</button>
                    )}
                    {t.reportStatus === "draft" && (
                      <button className="text-xs text-accent hover:underline mr-2" onClick={() => act(t.id, "resubmit")}>提交审核</button>
                    )}
                    <button className="text-xs text-danger hover:underline" onClick={async () => {
                      if (!confirm("删除该模板？")) return;
                      const r = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
                      if (r.ok) load(); else alert("删除失败");
                    }}>删除</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td className="td text-ink3" colSpan={5}>暂无模板</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
