"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/ui";

export default function PricingPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<any[]>([]);
  const [currentPlan, setCurrentPlan] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/plans").then((r) => r.json()).then(setPlans);
    fetch("/api/tenant/overview").then((r) => r.json()).then((d) => {
      setCurrentPlan(d.subscription?.plan?.code ?? "");
    });
  }, []);

  const buy = async (planCode: string) => {
    setBusy(true); setErr("");
    const r = await fetch("/api/subscriptions/buy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planCode, provider: "mock" }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "下单失败"); return; }
    if (j.payUrl) window.location.href = j.payUrl;
    else router.push("/settings");
  };

  return (
    <>
      <Topbar title="套餐定价" sub="月付套餐 · 包含额度 + 成员席位" />
      <div className="p-6">
        {err && <div className="text-sm text-danger mb-4">{err}</div>}
        <div className="grid md:grid-cols-3 gap-5 max-w-4xl">
          {plans.map((p) => {
            const isCurrent = p.code === currentPlan;
            const isFree = p.monthlyFeeFen === 0;
            return (
              <div key={p.code} className={`card p-6 flex flex-col ${isCurrent ? "ring-2 ring-primary" : ""}`}>
                <div className="text-lg font-bold mb-1">{p.name}</div>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-primary">¥{p.monthlyFeeYuan}</span>
                  <span className="text-sm text-ink3">/月</span>
                </div>
                <ul className="text-sm text-ink2 space-y-2 mb-6 flex-1">
                  <li>✓ 含 {p.smsIncluded.toLocaleString()} 条短信</li>
                  <li>✓ 最多 {p.maxUsers} 个成员</li>
                  <li>✓ 单价 ¥{(p.unitPriceFen / 100).toFixed(3)}/条</li>
                  <li>✓ 全部功能（触达/视频/画布）</li>
                </ul>
                {isCurrent ? (
                  <button className="btn w-full" disabled>当前套餐</button>
                ) : isFree ? (
                  <button className="btn w-full" disabled>注册默认</button>
                ) : (
                  <button className="btn btn-pri w-full" onClick={() => buy(p.code)} disabled={busy}>
                    {busy ? "下单中…" : "购买/升级"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-xs text-ink3 mt-6 max-w-4xl">
          套餐购买后立即生效，有效期 30 天。到期自动续费（可在设置中关闭）。
          如需按量充值，请前往「额度充值」页面。
        </div>
      </div>
    </>
  );
}
