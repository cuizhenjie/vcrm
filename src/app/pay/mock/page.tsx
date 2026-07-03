"use client";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Mock 支付完成页：模拟用户扫码后的「确认支付」。
 * 点确认后调 /api/payment/callback/mock 触发入账，成功后跳首页。
 * 仅用于本地联调，真实渠道由微信/支付宝自有的收银台完成。
 */
export default function MockPay() {
  const params = useSearchParams();
  const router = useRouter();
  const out = params.get("out");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const pay = async () => {
    setBusy(true);
    const r = await fetch("/api/payment/callback/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outTradeNo: out }),
    });
    setBusy(false);
    if (r.ok) {
      setMsg("支付成功，正在跳转…");
      setTimeout(() => router.push("/"), 1000);
    } else {
      setMsg("支付失败");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="card p-8 w-[360px] text-center">
        <div className="text-xl font-bold mb-2">Mock 收银台</div>
        <div className="text-sm text-ink3 mb-6">订单号：{out}</div>
        <button className="btn btn-pri w-full" onClick={pay} disabled={busy}>
          {busy ? "处理中…" : "确认支付（模拟）"}
        </button>
        {msg && <div className="text-sm text-ink3 mt-4">{msg}</div>}
      </div>
    </div>
  );
}
