"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/ui";
import TiltCard from "@/components/motion/TiltCard";

const PROVIDER_LABEL: Record<string, string> = { mock: "模拟支付（测试）", wechat: "微信支付", alipay: "支付宝" };

export default function RechargePage() {
  const router = useRouter();
  const [providers, setProviders] = useState<any[]>([]);
  const [unitCostFen, setUnitCostFen] = useState(0);
  const [quantity, setQuantity] = useState(1000);
  const [provider, setProvider] = useState("mock");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/recharge").then((r) => r.json()).then((d) => {
      setProviders(d.providers ?? []);
      setUnitCostFen(d.unitCostFen ?? 0);
      // 默认选中第一个已配置的渠道（跳过未配置的 wechat/alipay）
      const ready = (d.providers ?? []).find((p: any) => p.configured);
      if (ready) setProvider(ready.name);
    });
  }, []);

  const presets = [500, 1000, 5000, 10000, 50000];
  const amountFen = quantity * unitCostFen;
  const yuan = (amountFen / 100).toFixed(2);

  const submit = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/recharge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ quantity, provider }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "下单失败"); return; }
    // mock 跳转收银台，真实渠道跳支付链接
    if (j.payUrl) {
      window.location.href = j.payUrl;
    } else {
      router.push("/settings");
    }
  };

  return (
    <>
      <Topbar title="短信额度充值" sub="按量计费 · 充值即用" />
      <div className="p-4 md:p-6 max-w-2xl space-y-5 reveal">
        <TiltCard className="reveal">
          <div className="card p-6">
            <div className="font-semibold mb-4">选择充值数量</div>
            <div className="grid grid-cols-5 gap-2 mb-4">
              {presets.map((n) => (
                <button
                  key={n}
                  className={`p-3 rounded-lg border text-center transition ${quantity === n ? "border-primary bg-primary/5 text-primary font-semibold" : "border-line hover:border-accent"}`}
                  onClick={() => setQuantity(n)}
                >
                  <div className="text-sm">{n.toLocaleString()}</div>
                  <div className="text-xs text-ink3">条</div>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink2">自定义数量</span>
              <input
                type="number"
                className="input w-40"
                value={quantity}
                min={1}
                max={1000000}
                onChange={(e) => setQuantity(Math.max(1, Math.floor(Number(e.target.value) || 0)))}
              />
              <span className="text-sm text-ink3">条</span>
            </div>
          </div>
        </TiltCard>

        <TiltCard className="reveal" style={{ "--d": "80ms" } as React.CSSProperties}>
          <div className="card p-6">
            <div className="font-semibold mb-4">支付方式</div>
            {providers.length === 0 ? (
              <div className="text-sm text-ink3">暂无可用支付渠道（联系管理员开通）</div>
            ) : (
              <div className="space-y-2">
                {providers.map((p) => {
                  const disabled = !p.configured;
                  return (
                    <label
                      key={p.name}
                      className={`flex items-center gap-3 p-3 rounded-lg border transition ${disabled ? "border-line opacity-50 cursor-not-allowed" : provider === p.name ? "border-primary bg-primary/5 cursor-pointer" : "border-line hover:border-accent cursor-pointer"}`}
                    >
                      <input type="radio" name="provider" checked={provider === p.name} disabled={disabled} onChange={() => setProvider(p.name)} />
                      <span className="font-medium">{PROVIDER_LABEL[p.name] ?? p.name}</span>
                      {disabled && <span className="text-xs text-warn">未配置</span>}
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </TiltCard>

        <TiltCard className="reveal" style={{ "--d": "160ms" } as React.CSSProperties}>
          <div className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-ink2">充值数量</span>
            <span className="font-semibold">{quantity.toLocaleString()} 条</span>
          </div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm text-ink2">单价</span>
            <span className="text-sm">¥{(unitCostFen / 100).toFixed(4)} / 条</span>
          </div>
          <div className="flex items-center justify-between pt-3 border-t border-line mt-2">
            <span className="text-sm text-ink2">应付金额</span>
            <span className="text-2xl font-bold text-danger">¥{yuan}</span>
          </div>
          {err && <div className="text-sm text-danger mt-3">{err}</div>}
          <button className="btn btn-pri w-full mt-4" onClick={submit} disabled={busy || providers.length === 0}>
            {busy ? "下单中…" : "立即充值"}
          </button>
          </div>
        </TiltCard>
      </div>
    </>
  );
}
