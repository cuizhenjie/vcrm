"use client";
import { Suspense } from "react";
import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

/**
 * Mock 支付完成页：模拟用户扫码后的「确认支付」。
 * 点确认后调 /api/payment/callback/mock 触发入账，成功后跳首页。
 * 仅用于本地联调，真实渠道由微信/支付宝自有的收银台完成。
 *
 * 注意：useSearchParams 必须包在 Suspense 边界内，否则 Next.js 14 静态预渲染失败。
 */
function MockPayInner() {
  const params = useSearchParams();
  const router = useRouter();
  const out = params.get("out");
  const amount = params.get("amount");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const pay = async () => {
    setBusy(true);
    // 回传金额（amountFen）供服务端校验，保证 mock 闭环与真实渠道同样走金额防篡改
    const r = await fetch("/api/payment/callback/mock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outTradeNo: out, amountFen: Number(amount) || undefined }),
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
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="reveal-scale w-[min(380px,calc(100vw-2rem))] rounded-2xl border border-white/50 bg-white/95 backdrop-blur-xl p-8 text-center shadow-[0_24px_70px_-20px_rgba(10,14,40,0.55)]">
        <div className="text-xl font-bold mb-2">Mock 收银台</div>
        <div className="text-sm text-ink3 mb-6">订单号：{out}</div>
        <div className="text-sm text-ink2 mb-6">应付：¥{amount ? (Number(amount) / 100).toFixed(2) : "—"}</div>
        <button className="btn btn-pri w-full" onClick={pay} disabled={busy}>
          {busy ? "处理中…" : "确认支付（模拟）"}
        </button>
        {msg && <div className="text-sm text-ink3 mt-4">{msg}</div>}
      </div>
    </div>
  );
}

export default function MockPay() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-ink3">加载中…</div>}>
      <MockPayInner />
    </Suspense>
  );
}
