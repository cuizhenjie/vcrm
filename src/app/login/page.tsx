"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pwd }),
    });
    setBusy(false);
    if (r.ok) router.push("/");
    else {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "登录失败");
    }
  };
  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="card p-8 w-[340px]">
        <div className="text-2xl font-bold tracking-wide mb-1"><span className="text-primary">V</span>CRM</div>
        <div className="text-sm text-ink3 mb-6">5G 互动营销触达平台</div>
        <input className="input mb-3" type="email" placeholder="邮箱" value={email}
          onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} autoFocus />
        <input className="input mb-3" type="password" placeholder="密码" value={pwd}
          onChange={(e) => setPwd(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div className="text-sm text-danger mb-3">{err}</div>}
        <button className="btn btn-pri w-full" onClick={submit} disabled={busy}>{busy ? "登录中…" : "登录"}</button>
        <div className="text-xs text-ink3 mt-4 text-center">
          还没有账号？<Link href="/register" className="text-primary underline">立即注册</Link>
        </div>
      </div>
    </div>
  );
}
