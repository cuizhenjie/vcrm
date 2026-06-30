"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/ui";

type Variant = { templateId: string; weight: number };

export default function NewCampaign() {
  const router = useRouter();
  const [tpls, setTpls] = useState<any[]>([]);
  const [facets, setFacets] = useState<{ provinces: string[]; carriers: string[]; total: number }>({ provinces: [], carriers: [], total: 0 });
  const [form, setForm] = useState({ name: "", type: "text_sms", templateId: "" });
  const [abMode, setAbMode] = useState(false);
  const [variants, setVariants] = useState<Variant[]>([{ templateId: "", weight: 1 }, { templateId: "", weight: 1 }]);
  const [autoRollout, setAutoRollout] = useState(true);
  const [testRatio, setTestRatio] = useState(20);
  // 分群
  const [provinces, setProvinces] = useState<string[]>([]);
  const [carriers, setCarriers] = useState<string[]>([]);
  const [onlyIntent, setOnlyIntent] = useState(false);
  const [matched, setMatched] = useState<number | null>(null);
  // 定时
  const [scheduledAt, setScheduledAt] = useState("");
  const [quietHours, setQuietHours] = useState(true);
  const [busy, setBusy] = useState(false);
  // P2-9: 分群预设
  const [presets, setPresets] = useState<any[]>([]);
  const [presetName, setPresetName] = useState("");
  const [savingPreset, setSavingPreset] = useState(false);

  useEffect(() => {
    fetch("/api/templates").then((r) => r.json()).then((d) => setTpls(d.filter((t: any) => t.reportStatus === "approved")));
    fetch("/api/customers/facets").then((r) => r.json()).then(setFacets);
    fetch("/api/segment-presets").then((r) => r.json()).then(setPresets).catch(() => setPresets([]));
  }, []);

  const savePreset = async () => {
    if (!presetName.trim()) return;
    setSavingPreset(true);
    const r = await fetch("/api/segment-presets", {
      method: "POST", body: JSON.stringify({
        name: presetName.trim(), provinces, carriers, onlyIntent,
      }),
    }).then((r) => r.json());
    setSavingPreset(false);
    if (r.error) return alert(r.error);
    setPresets([{ ...r, matchCount: matched ?? 0 }, ...presets]);
    setPresetName("");
  };

  const loadPreset = (p: any) => {
    setProvinces(p.provinces || []);
    setCarriers(p.carriers || []);
    setOnlyIntent(!!p.onlyIntent);
  };

  const deletePreset = async (id: string) => {
    if (!confirm("删除该分群预设？")) return;
    await fetch(`/api/segment-presets/${id}`, { method: "DELETE" });
    setPresets(presets.filter((p) => p.id !== id));
  };

  const segment = { provinces, carriers, onlyIntent };
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/customers/segment", { method: "POST", body: JSON.stringify(segment) })
        .then((r) => r.json()).then((d) => setMatched(d.count));
    }, 250);
    return () => clearTimeout(t);
  }, [provinces, carriers, onlyIntent]);

  const toggle = (arr: string[], set: (v: string[]) => void, v: string) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const setV = (i: number, patch: Partial<Variant>) => setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const submit = async () => {
    if (!form.name) return alert("请填写任务名称");
    const payload: any = { name: form.name, type: form.type, segment, scheduledAt: scheduledAt || null, quietHours };
    if (abMode) {
      const vs = variants.filter((v) => v.templateId);
      if (vs.length < 2) return alert("A/B 测试至少需要 2 个有效变体");
      payload.variants = vs.map((v, i) => ({ ...v, label: String.fromCharCode(65 + i) }));
      payload.autoRollout = autoRollout; payload.testRatio = testRatio;
    } else payload.templateId = form.templateId;
    setBusy(true);
    const c = await fetch("/api/campaigns", { method: "POST", body: JSON.stringify(payload) }).then((r) => r.json());
    setBusy(false);
    if (c.error) return alert(c.error);
    router.push(`/campaigns/${c.id}`);
  };

  return (
    <>
      <Topbar title="新建触达任务" sub="营销触达" />
      <div className="p-6 max-w-2xl space-y-5">
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
        </div>

        {/* 客户分群 */}
        <div className="card p-6 space-y-3">
          <div className="font-semibold">客户分群 <span className="text-xs text-ink3 font-normal">不选则默认全部非黑名单客户</span></div>
          {facets.provinces.length > 0 && (
            <div><div className="text-sm text-ink2 mb-1.5">归属地</div>
              <div className="flex flex-wrap gap-2">
                {facets.provinces.map((p) => (
                  <button key={p} onClick={() => toggle(provinces, setProvinces, p)}
                    className={`px-3 py-1 rounded-full text-sm border ${provinces.includes(p) ? "bg-primary text-white border-primary" : "border-line text-ink2"}`}>{p}</button>
                ))}
              </div></div>
          )}
          {facets.carriers.length > 0 && (
            <div><div className="text-sm text-ink2 mb-1.5">运营商</div>
              <div className="flex flex-wrap gap-2">
                {facets.carriers.map((c) => (
                  <button key={c} onClick={() => toggle(carriers, setCarriers, c)}
                    className={`px-3 py-1 rounded-full text-sm border ${carriers.includes(c) ? "bg-primary text-white border-primary" : "border-line text-ink2"}`}>{c}</button>
                ))}
              </div></div>
          )}
          <label className="flex items-center gap-2 text-sm text-ink2 cursor-pointer">
            <input type="checkbox" checked={onlyIntent} onChange={(e) => setOnlyIntent(e.target.checked)} />
            只发历史「有意向」客户（高价值复投）
          </label>
          <div className="text-sm bg-violet-50 text-primary rounded-lg px-3 py-2">
            匹配客户：<b>{matched ?? "…"}</b> 人 / 全部 {facets.total} 人
          </div>
          {/* P2-9: 分群预设保存/加载 */}
          <div className="border-t border-line/60 pt-3 mt-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <input className="input !w-auto flex-1 min-w-[180px]" placeholder="命名当前分群（如：高价值江浙沪）"
                     value={presetName} onChange={(e) => setPresetName(e.target.value)} />
              <button className="btn" onClick={savePreset} disabled={!presetName.trim() || savingPreset}>
                {savingPreset ? "保存中…" : "💾 保存当前分群"}
              </button>
            </div>
            {presets.length > 0 && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="text-ink3">已保存预设：</span>
                {presets.map((p) => (
                  <div key={p.id} className="flex items-center gap-1 bg-blue-50 rounded-full pl-3 pr-1 py-0.5">
                    <button onClick={() => loadPreset(p)} className="text-accent hover:underline" title={`匹配 ${p.matchCount} 人`}>
                      {p.name} <span className="text-ink3">({p.matchCount})</span>
                    </button>
                    <button onClick={() => deletePreset(p.id)} className="text-ink3 hover:text-danger px-1" title="删除">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* A/B */}
        <div className="card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setAbMode(!abMode)} className={`w-10 h-6 rounded-full relative transition ${abMode ? "bg-primary" : "bg-gray-300"}`}>
              <span className={`absolute w-4 h-4 rounded-full bg-white top-1 transition-all ${abMode ? "left-5" : "left-1"}`} /></button>
            <div><div className="text-sm font-medium">A/B 测试</div><div className="text-xs text-ink3">多文案按权重分流，按点击率选赢家</div></div>
          </div>
          {!abMode ? (
            <select className="input" value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })}>
              <option value="">选择短信模板（已报备通过）</option>
              {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          ) : (
            <div className="space-y-2.5">
              {variants.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-bold flex items-center justify-center shrink-0">{String.fromCharCode(65 + i)}</span>
                  <select className="input flex-1" value={v.templateId} onChange={(e) => setV(i, { templateId: e.target.value })}>
                    <option value="">选择文案变体</option>
                    {tpls.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <span className="text-xs text-ink3">权重</span>
                  <input type="number" min={1} className="input !w-16" value={v.weight} onChange={(e) => setV(i, { weight: Number(e.target.value) })} />
                </div>
              ))}
              <div className="pt-3 border-t border-line/60 space-y-2.5">
                <div className="flex items-center gap-3">
                  <button onClick={() => setAutoRollout(!autoRollout)} className={`w-10 h-6 rounded-full relative transition ${autoRollout ? "bg-primary" : "bg-gray-300"}`}>
                    <span className={`absolute w-4 h-4 rounded-full bg-white top-1 transition-all ${autoRollout ? "left-5" : "left-1"}`} /></button>
                  <div><div className="text-sm font-medium">自动放量</div><div className="text-xs text-ink3">小流量测出赢家后，剩余名单自动全投赢家</div></div>
                </div>
                {autoRollout && (
                  <div className="flex items-center gap-2 text-sm"><span className="text-ink2">测试流量占比</span>
                    <input type="range" min={10} max={50} step={5} value={testRatio} onChange={(e) => setTestRatio(Number(e.target.value))} className="flex-1 max-w-[200px]" />
                    <span className="font-medium text-primary w-10">{testRatio}%</span></div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 定时 + 避扰 */}
        <div className="card p-6 space-y-3">
          <div className="font-semibold">发送时间</div>
          <div className="flex items-center gap-3 flex-wrap">
            <input type="datetime-local" className="input !w-auto" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} />
            <span className="text-xs text-ink3">留空＝创建后手动发送；填未来时间＝到点自动发送</span>
          </div>
          <label className="flex items-center gap-2 text-sm text-ink2 cursor-pointer">
            <input type="checkbox" checked={quietHours} onChange={(e) => setQuietHours(e.target.checked)} />
            避扰时段（{process.env.NEXT_PUBLIC_QUIET ?? "22:00–08:00"} 不发送，顺延次日，防投诉封号）
          </label>
        </div>

        <button className="btn btn-pri" onClick={submit} disabled={busy}>{busy ? "创建中…" : "创建任务"}</button>
      </div>
    </>
  );
}
