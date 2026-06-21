"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

type T = { id: string; name: string; type: string; content: string; reportStatus: string };

export default function Templates() {
  const [list, setList] = useState<T[]>([]);
  const [form, setForm] = useState({ name: "", type: "text", content: "" });
  const load = () => fetch("/api/templates").then((r) => r.json()).then(setList);
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!form.name || !form.content) return;
    await fetch("/api/templates", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", type: "text", content: "" }); load();
  };
  return (
    <>
      <Topbar title="短信模板" sub="内容与话术 · 联麓需先报备签名与模板" />
      <div className="p-6 grid md:grid-cols-[340px_1fr] gap-5">
        <div className="card p-5 h-fit">
          <div className="font-semibold mb-3">新建模板</div>
          <input className="input mb-2.5" placeholder="模板名称" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input mb-2.5" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="text">文本短信</option><option value="mms">视频彩信</option><option value="flash">闪信</option>
          </select>
          <textarea className="input !h-24 py-2" placeholder="短信正文（营销类需含退订方式）" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
          <button className="btn btn-pri w-full mt-3" onClick={create}>提交（待报备）</button>
        </div>
        <div className="card overflow-hidden h-fit">
          <table className="w-full">
            <thead><tr><th className="th">模板名称</th><th className="th">类型</th><th className="th">内容</th><th className="th">报备状态</th></tr></thead>
            <tbody>
              {list.map((t) => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="td font-medium">{t.name}</td>
                  <td className="td"><Tag s={t.type} /></td>
                  <td className="td max-w-sm truncate text-ink2">{t.content}</td>
                  <td className="td"><Tag s={t.reportStatus} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
