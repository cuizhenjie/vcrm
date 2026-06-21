"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

type C = { id: string; name?: string; mobile: string; province?: string; carrier?: string; isBlacklist: boolean; videoCapable?: string; checkStatus: string };

export default function Customers() {
  const [list, setList] = useState<C[]>([]);
  const [raw, setRaw] = useState("张三,13800138010\n李四,13800138011");
  const [batchName, setBatchName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => fetch("/api/customers").then((r) => r.json()).then(setList);
  useEffect(() => { load(); }, []);

  const importNames = async () => {
    const rows = raw.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [a, b] = l.split(/[,，\t]/); return b ? { name: a, mobile: b.trim() } : { mobile: a };
    });
    setLoading(true);
    const r = await fetch("/api/customers", { method: "POST", body: JSON.stringify({ batchName: batchName || "手动导入", rows }) }).then((r) => r.json());
    setMsg(`导入完成：有效 ${r.valid}/${r.total}`); setLoading(false); load();
  };
  const check = async () => {
    setLoading(true); setMsg("号码检测中…");
    const r = await fetch("/api/customers/check", { method: "POST", body: JSON.stringify({}) }).then((r) => r.json());
    setMsg(`检测完成：有效 ${r.valid}/${r.checked}`); setLoading(false); load();
  };
  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file); fd.append("batchName", batchName || file.name);
    setLoading(true); setMsg("解析上传中…");
    const r = await fetch("/api/customers/upload", { method: "POST", body: fd }).then((r) => r.json());
    setMsg(r.error ? r.error : `上传完成：有效 ${r.valid}/${r.total}，识别列：${(r.columns||[]).join("、")}`);
    setLoading(false); e.target.value = ""; load();
  };

  return (
    <>
      <Topbar title="客户导入" sub="客户管理">
        <button className="btn" onClick={check} disabled={loading}>号码检测</button>
      </Topbar>
      <div className="p-6 space-y-5">
        <div className="card p-5">
          <div className="font-semibold mb-3">导入名单 <span className="text-xs text-ink3 font-normal">每行一条：姓名,手机号（姓名可省略）</span></div>
          <input className="input mb-2.5" placeholder="批次名称" value={batchName} onChange={(e) => setBatchName(e.target.value)} />
          <textarea className="input !h-28 py-2 font-mono" value={raw} onChange={(e) => setRaw(e.target.value)} />
          <div className="flex items-center gap-3 mt-3">
            <button className="btn btn-pri" onClick={importNames} disabled={loading}>粘贴导入</button>
            <label className="btn cursor-pointer">
              上传 Excel/CSV
              <input type="file" accept=".xls,.xlsx,.csv" className="hidden" onChange={upload} />
            </label>
            {msg && <span className="text-sm text-ink2">{msg}</span>}
          </div>
          <p className="text-xs text-ink3 mt-2">Excel 自动识别「手机号/姓名」列，其余列存为千人千面变量（如 product、date），可在短信模板里用 {"{product}"} 引用。</p>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full">
            <thead><tr><th className="th">客户</th><th className="th">手机号</th><th className="th">归属地</th><th className="th">运营商</th><th className="th">黑名单</th><th className="th">视频通话</th><th className="th">检测</th></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="td">{c.name ?? "—"}</td>
                  <td className="td font-mono">{c.mobile}</td>
                  <td className="td">{c.province ?? "—"}</td>
                  <td className="td">{c.carrier ?? "—"}</td>
                  <td className="td">{c.isBlacklist ? <span className="tag bg-red-50 text-danger">是</span> : <span className="tag bg-green-50 text-ok">否</span>}</td>
                  <td className="td">{c.videoCapable === "yes" ? "支持" : c.videoCapable === "no" ? "不支持" : "待检测"}</td>
                  <td className="td"><Tag s={c.checkStatus === "done" ? "done" : "pending"} /></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td className="td text-ink3" colSpan={7}>暂无客户，先在上方导入名单</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
