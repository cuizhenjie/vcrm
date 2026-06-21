"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/ui";

type Variant = { templateId: string; weight: number };

export default function NewCampaign() {
  const router = useRouter();
  const [tpls, setTpls] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", type: "text_sms", templateId: "" });
  const [abMode, setAbMode] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([{ templateId: "", weight: 1 }, { templateId: "", weight: 1 }]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { fetch("/api/templates").then((r) => r.json()).then((d) => setTpls(d.filter((t: any) => t.reportStatus === "approved"))); }, []);

  const setV = (i: number, patch: Partial<Variant>) => setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));
  const addV = () => variants.length < 3 && setVariants([...variants, { templateId: "", weight: 1 }]);
  const delV = (i: number) => variants.length > 2 && setVariants(variants.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (!form.name) return alert("请填写任务名称");
    const payload: any = { name: form.name, type: form.type };
    if (abMode) {
      const vs = variants.filter((v) => v.templateId);
      if (vs.length < 2) return alert("A/B 测试至少需要 2 个有效变体");
      payload.variants = vs.map((v, i) => ({ ...v, label: String.fromCharCode(65 + i) }));
    } else {
      payload.templateId = form.templateId;
    }
    setBusy(true);
    const c = await fetch("/api/campaigns", { method: "POST", body: JSON.stringify(payload) }).then((r) => r.json());
    setBusy(false);
    if (c.error) return alert(c.error);
    router.push(`/campaigns/${c.id}`);
  };

  return (
    <>
      <Topbar title="新建触达任务" sub="营销触达" />
      <div className="p-6 max-w-2xl">
        <div className="card p-6 space-y-4">
          <div><label className="text-sm text-ink2 block mb-1.5"><span className="text-danger">*</span> 任务名称</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="命名任务方便区分" /></div>

          <div><label className="text-sm text-ink2 block mb-1.5">触达类型</label>
            <div className="flex border border-line rounded-lg overflow-hidden w-fit">
              {[["text_sms", "文本短信"], ["video_sms", "视频短信"], ["flash", "闪信"]].map(([v, l]) => (
                <button key={v} onClick={() => setForm({ ...form, type: v })}
                  className={`px-4 py-2 text-sm border-r border-line last:border-0 ${form.type === v ? "bg-primary text-white" : "text-ink2"}`}>{l}</button>
              ))}
            </div></div>

          <div className="flex items-center gap-3 py-1 border-y border-line/60">
            <button onClick={() => setAbMode(!abMode)}
              className={`w-10 h-6 rounded-full relative transition ${abMode ? "bg-primary" : "bg-gray-300"}`}>
              <span className={`absolute w-4 h-4 rounded-full bg-white top-1 transition-all ${abMode ? "left-5" : "left-1"}`} /></button>
            <div><div className="text-sm font-medium">A/B 测试</div>
              <div className="text-xs text-ink3">多文案按权重分流投放，按点击率自动选出赢家</div></div>
          </div>

          {!abMode ? (
            <div><label className="text-sm text-ink2 block mb-1.5">短信模板（仅显示已报备通过）</label>
              <select className="input" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
                <option value="">请选择</option>
                {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select></div>
          ) : (
            <div className="space-y-2.5">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">{String.fromCharCode(65 + i)}</span>
                  <select className="input flex-1" value={v.templateId} onChange={(e) => setV(i, { templateId: e.target.value })}>
                    <option value="">选择文案变体</option>
                    {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <div className="flex items-center gap-1 shrink-0"><span className="text-xs text-ink3">权重</span>
                    <input type="number" min={1} className="input !w-16" value={v.weight} onChange={(e) => setV(i, { weight: Number(e.target.value) })} /></div>
                  {variants.length > 2 && <button className="text-ink3 hover:text-danger px-1" onClick={() => delV(i)}>✕</button>}
                </div>
              ))}
              {variants.length < 3 && <button className="text-accent text-sm" onClick={addV}>＋ 添加变体（最多 3 个）</button>}
            </div>
          )}

          <p className="text-xs text-ink3">名单默认取全部「非黑名单」有效客户，发送前再过一遍风控。</p>
          <button className="btn btn-pri" onClick={submit} disabled={busy}>{busy ? "创建中…" : "创建任务"}</button>
        </div>
      </div>
    </>
  );
}
