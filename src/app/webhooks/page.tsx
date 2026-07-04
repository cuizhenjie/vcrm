"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

const EVENT_TYPES = [
  { key: "message.clicked", label: "短信点击" },
  { key: "message.delivery", label: "送达回执" },
  { key: "message.failed", label: "发送失败" },
  { key: "lead.updated", label: "线索更新" },
  { key: "lead.won", label: "线索成交" },
  { key: "customer.unsubscribed", label: "客户退订" },
];

export default function WebhooksPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const blank = { name: "", url: "", secret: "", eventTypes: ["lead.won", "customer.unsubscribed"] };
  const [form, setForm] = useState<any>(blank);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/webhook-endpoints").then((r) => r.json());
    setList(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setForm(blank); setEditing(null); setShowForm(true); setErr(""); };
  const openEdit = (e: any) => {
    let types: string[] = [];
    try { types = JSON.parse(e.eventTypes); } catch { types = []; }
    setForm({ name: e.name, url: e.url, secret: "", eventTypes: types });
    setEditing(e);
    setShowForm(true);
    setErr("");
  };

  const toggleEvent = (key: string) => {
    const has = form.eventTypes.includes(key);
    setForm({ ...form, eventTypes: has ? form.eventTypes.filter((t: string) => t !== key) : [...form.eventTypes, key] });
  };

  const save = async () => {
    setBusy(true); setErr("");
    if (!form.name.trim() || !form.url.trim()) { setErr("名称和 URL 必填"); setBusy(false); return; }
    if (form.eventTypes.length === 0) { setErr("至少订阅一个事件"); setBusy(false); return; }
    const body: any = { name: form.name, url: form.url, eventTypes: form.eventTypes };
    if (form.secret) body.secret = form.secret;

    const url = editing ? `/api/webhook-endpoints/${editing.id}` : "/api/webhook-endpoints";
    const method = editing ? "PATCH" : "POST";
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "保存失败"); return; }
    setShowForm(false);
    load();
  };

  const toggleStatus = async (e: any) => {
    await fetch(`/api/webhook-endpoints/${e.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: e.status === "active" ? "inactive" : "active" }),
    });
    load();
  };

  const del = async (e: any) => {
    if (!confirm(`删除 webhook「${e.name}」？`)) return;
    await fetch(`/api/webhook-endpoints/${e.id}`, { method: "DELETE" });
    load();
  };

  return (
    <>
      <Topbar title="Webhook 配置" sub="外部 CRM 集成 · 线索/成交/退订事件推送">
        <button className="btn btn-pri" onClick={openNew}>+ 新建</button>
      </Topbar>
      <div className="p-6 space-y-5">
        {showForm && (
          <div className="card p-5">
            <div className="font-semibold mb-4">{editing ? "编辑 Webhook" : "新建 Webhook"}</div>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-ink2 block mb-1">名称</label>
                <input className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：CRM 线索同步" />
              </div>
              <div>
                <label className="text-sm text-ink2 block mb-1">回调 URL</label>
                <input className="input w-full" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://your-crm.com/webhook" />
              </div>
              <div>
                <label className="text-sm text-ink2 block mb-1">
                  签名密钥 {editing && <span className="text-ink3">（留空则不修改）</span>}
                </label>
                <input className="input w-full" type="password" value={form.secret} onChange={(e) => setForm({ ...form, secret: e.target.value })} placeholder="用于校验 X-VCRM-Signature 头" />
              </div>
              <div>
                <label className="text-sm text-ink2 block mb-2">订阅事件</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {EVENT_TYPES.map((ev) => (
                    <label key={ev.key} className={`flex items-center gap-2 p-2 rounded border cursor-pointer text-sm ${form.eventTypes.includes(ev.key) ? "border-primary bg-primary/5" : "border-line"}`}>
                      <input type="checkbox" checked={form.eventTypes.includes(ev.key)} onChange={() => toggleEvent(ev.key)} />
                      <span>{ev.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {err && <div className="text-sm text-danger">{err}</div>}
              <div className="flex gap-2 pt-2">
                <button className="btn btn-pri" onClick={save} disabled={busy}>{busy ? "保存中…" : "保存"}</button>
                <button className="btn" onClick={() => setShowForm(false)}>取消</button>
              </div>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">Webhook 列表（{list.length}）</div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">名称</th><th className="th">URL</th><th className="th">订阅事件</th><th className="th">状态</th><th className="th">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="td text-ink3" colSpan={5}>加载中…</td></tr>
              ) : list.length === 0 ? (
                <tr><td className="td text-ink3" colSpan={5}>暂无 Webhook 配置，点击右上角「新建」</td></tr>
              ) : list.map((e) => {
                let types: string[] = [];
                try { types = JSON.parse(e.eventTypes); } catch { types = []; }
                return (
                  <tr key={e.id}>
                    <td className="td font-medium">{e.name}</td>
                    <td className="td text-ink3 max-w-[260px] truncate">{e.url}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {types.map((t) => <span key={t} className="tag bg-blue-50 text-accent text-xs">{t}</span>)}
                      </div>
                    </td>
                    <td className="td"><Tag s={e.status} /></td>
                    <td className="td">
                      <button className="text-xs text-accent hover:underline mr-3" onClick={() => openEdit(e)}>编辑</button>
                      <button className="text-xs text-warn hover:underline mr-3" onClick={() => toggleStatus(e)}>
                        {e.status === "active" ? "停用" : "启用"}
                      </button>
                      <button className="text-xs text-danger hover:underline" onClick={() => del(e)}>删除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
