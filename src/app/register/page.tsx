"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function Register() {
  const router = useRouter();
  const [form, setForm] = useState({ slug: "", tenantName: "", email: "", userName: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (r.ok) router.push("/");
    else {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "注册失败");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-page">
      <div className="card p-8 w-[380px]">
        <div className="text-2xl font-bold tracking-wide mb-1"><span className="text-primary">V</span>CRM</div>
        <div className="text-sm text-ink3 mb-6">开通新租户</div>
        <input className="input mb-3" placeholder="租户标识（小写字母数字，3-32位）" value={form.slug}
          onChange={set("slug")} autoFocus />
        <input className="input mb-3" placeholder="公司/团队名称" value={form.tenantName}
          onChange={set("tenantName")} />
        <input className="input mb-3" placeholder="你的姓名" value={form.userName}
          onChange={set("userName")} />
        <input className="input mb-3" type="email" placeholder="邮箱" value={form.email}
          onChange={set("email")} />
        <input className="input mb-3" type="password" placeholder="密码（至少 8 位）" value={form.password}
          onChange={set("password")} onKeyDown={(e) => e.key === "Enter" && submit()} />
        {err && <div className="text-sm text-danger mb-3">{err}</div>}
        <button className="btn btn-pri w-full" onClick={submit} disabled={busy}>{busy ? "注册中…" : "注册并开始"}</button>
        <div className="text-xs text-ink3 mt-4 text-center">
          已有账号？<Link href="/login" className="text-primary underline">去登录</Link>
        </div>
      </div>
    </div>
  );
}
