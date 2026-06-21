"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/ui";

export default function NewCampaign() {
  const router = useRouter();
  const [tpls, setTpls] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", type: "text_sms", templateId: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/templates").then((r) => r.json()).then((d) => setTpls(d.filter((t: any) => t.reportStatus === "approved"))); }, []);

  const submit = async () => {
    if (!form.name) return alert("请填写任务名称");
    setBusy(true);
    const c = await fetch("/api/campaigns", { method: "POST", body: JSON.stringify(form) }).then((r) => r.json());
    setBusy(false);
    if (c.error) return alert(c.error);
    router.push(`/campaigns/${c.id}`);
  };
  return (
    <>
      <Topbar title="新建触达任务" sub="营销触达" />
      <div className="p-6 max-w-xl">
        <div className="card p-6 space-y-4">
          <div><label className="text-sm text-ink2 block mb-1.5"><span className="text-danger">*</span> 任务名称</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="命名任务方便区分" /></div>
          <div><label className="text-sm text-ink2 block mb-1.5">外呼类型</label>
            <div className="flex border border-line rounded-lg overflow-hidden w-fit">
              {[["text_sms", "文本短信"], ["video_sms", "视频短信"], ["flash", "闪信"]].map(([v, l]) => (
                <button key={v} onClick={() => setForm({ ...form, type: v })}
                  className={`px-4 py-2 text-sm border-r border-line last:border-0 ${form.type === v ? "bg-primary text-white" : "text-ink2"}`}>{l}</button>
              ))}
            </div></div>
          <div><label className="text-sm text-ink2 block mb-1.5">短信模板（仅显示已报备通过）</label>
            <select className="input" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
              <option value="">请选择</option>
              {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>
          <p className="text-xs text-ink3">名单默认取全部「非黑名单」有效客户。发送前会再过一遍风控（黑名单 / 敏感地域）。</p>
          <button className="btn btn-pri" onClick={submit} disabled={busy}>{busy ? "创建中…" : "创建任务"}</button>
        </div>
      </div>
    </>
  );
}
