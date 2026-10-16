"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

const ROLE_LABEL: Record<string, string> = { owner: "所有者", admin: "管理员", sales: "运营", viewer: "只读" };

export default function MembersPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: "", name: "", role: "sales", password: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/members").then((r) => r.json());
    setList(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const invite = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "邀请失败"); return; }
    setShowForm(false);
    setForm({ email: "", name: "", role: "sales", password: "" });
    load();
  };

  const changeRole = async (id: string, role: string) => {
    const r = await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error || "操作失败"); return; }
    load();
  };

  const toggleStatus = async (id: string, cur: string) => {
    const r = await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: cur === "active" ? "inactive" : "active" }),
    });
    if (!r.ok) { const j = await r.json(); alert(j.error || "操作失败"); return; }
    load();
  };

  const resetPwd = async (id: string) => {
    const pwd = prompt("输入新密码（至少 8 位）：");
    if (!pwd || pwd.length < 8) { if (pwd !== null) alert("密码至少 8 位"); return; }
    const r = await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwd }),
    });
    if (r.ok) alert("密码已重置"); else alert("重置失败");
  };

  const del = async (id: string, name: string) => {
    if (!confirm(`删除成员「${name}」？`)) return;
    const r = await fetch(`/api/members/${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json(); alert(j.error || "删除失败"); return; }
    load();
  };

  return (
    <>
      <Topbar title="成员管理" sub="团队协作 · 角色 · 成员席位">
        <button className="btn btn-pri" onClick={() => setShowForm(!showForm)}>+ 邀请成员</button>
      </Topbar>
      <div className="p-4 md:p-6 space-y-5 reveal">
        {showForm && (
          <div className="card p-5">
            <div className="font-semibold mb-4">邀请新成员</div>
            <div className="grid sm:grid-cols-2 gap-3">
              <input className="input" placeholder="邮箱" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <input className="input" placeholder="姓名（可选）" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="admin">管理员</option>
                <option value="sales">运营</option>
                <option value="viewer">只读</option>
              </select>
              <input className="input" type="password" placeholder="初始密码（至少8位）" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </div>
            {err && <div className="text-sm text-danger mt-2">{err}</div>}
            <div className="flex gap-2 mt-3">
              <button className="btn btn-pri" onClick={invite} disabled={busy}>{busy ? "邀请中…" : "邀请"}</button>
              <button className="btn" onClick={() => setShowForm(false)}>取消</button>
            </div>
          </div>
        )}

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">成员列表（{list.length}）</div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead>
              <tr><th className="th">姓名</th><th className="th">邮箱</th><th className="th">角色</th><th className="th">状态</th><th className="th">操作</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="td text-ink3" colSpan={5}>加载中…</td></tr>
              ) : list.length === 0 ? (
                <tr><td className="td text-ink3" colSpan={5}>暂无成员</td></tr>
              ) : list.map((m) => (
                <tr key={m.id}>
                  <td className="td font-medium">{m.name || "—"}</td>
                  <td className="td text-ink2">{m.email}</td>
                  <td className="td">
                    {m.role === "owner" ? (
                      <span className="tag bg-violet-50 text-primary">{ROLE_LABEL[m.role]}</span>
                    ) : (
                      <select
                        className="text-xs border-none bg-transparent outline-none cursor-pointer"
                        value={m.role}
                        onChange={(e) => changeRole(m.id, e.target.value)}
                      >
                        <option value="admin">管理员</option>
                        <option value="sales">运营</option>
                        <option value="viewer">只读</option>
                      </select>
                    )}
                  </td>
                  <td className="td"><Tag s={m.status} /></td>
                  <td className="td whitespace-nowrap">
                    {m.role !== "owner" && (
                      <>
                        <button className="text-xs text-warn hover:underline mr-2" onClick={() => toggleStatus(m.id, m.status)}>
                          {m.status === "active" ? "禁用" : "启用"}
                        </button>
                        <button className="text-xs text-accent hover:underline mr-2" onClick={() => resetPwd(m.id)}>重置密码</button>
                        <button className="text-xs text-danger hover:underline" onClick={() => del(m.id, m.name || m.email)}>删除</button>
                      </>
                    )}
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
