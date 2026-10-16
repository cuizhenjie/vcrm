"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Topbar, Tag } from "@/components/ui";
import TiltCard from "@/components/motion/TiltCard";
import CountUp from "@/components/motion/CountUp";

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("zh-CN") : "—");
const fen = (n?: number | null) => n == null ? "—" : `¥${(n / 100).toFixed(2)}`;

export default function SettingsPage() {
  const [data, setData] = useState<any>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  useEffect(() => {
    fetch("/api/tenant/overview").then((r) => r.json()).then(setData);
    fetch("/api/invoices").then((r) => r.json()).then((d) => setInvoices(Array.isArray(d) ? d : []));
  }, []);
  if (!data) return <div className="p-4 md:p-6 text-ink3">加载中…</div>;
  const plan = data.subscription?.plan;
  return (
    <>
      <Topbar title="租户与计费" sub="商业化运营 · 套餐 / 额度 / 发送审计">
        <Link href="/pricing" className="btn">套餐升级</Link>
        <Link href="/recharge" className="btn btn-pri">+ 充值额度</Link>
      </Topbar>
      <div className="p-4 md:p-6 space-y-5 reveal">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <TiltCard className="reveal">
            <div className="card card-interactive p-4 h-full">
              <div className="text-sm text-ink2 mb-2">租户</div>
              <div className="text-2xl font-bold text-primary leading-none">{data.tenant.name}</div>
              <div className="text-xs text-ink3 mt-1.5">{data.tenant.slug}</div>
            </div>
          </TiltCard>
          <TiltCard className="reveal" style={{ "--d": "70ms" } as React.CSSProperties}>
            <div className="card card-interactive p-4 h-full">
              <div className="text-sm text-ink2 mb-2">短信余额</div>
              <div className="text-2xl font-bold text-ok leading-none tabular-nums">
                <CountUp to={data.balance} />
              </div>
              <div className="text-xs text-ink3 mt-1.5">发送前实时预扣</div>
            </div>
          </TiltCard>
          <TiltCard className="reveal" style={{ "--d": "140ms" } as React.CSSProperties}>
            <div className="card card-interactive p-4 h-full">
              <div className="text-sm text-ink2 mb-2">当前套餐</div>
              <div className="text-2xl font-bold text-primary leading-none">{plan?.name ?? "—"}</div>
              <div className="text-xs text-ink3 mt-1.5">含 {plan?.smsIncluded ?? 0} 条</div>
            </div>
          </TiltCard>
          <TiltCard className="reveal" style={{ "--d": "210ms" } as React.CSSProperties}>
            <div className="card card-interactive p-4 h-full">
              <div className="text-sm text-ink2 mb-2">订阅状态</div>
              <div className="text-2xl font-bold text-primary leading-none">{data.subscription?.status ?? "—"}</div>
              <div className="text-xs text-ink3 mt-1.5">单价 {fen(plan?.unitPriceFen)}/条</div>
            </div>
          </TiltCard>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card overflow-hidden">
            <div className="font-semibold p-5 pb-3">额度账本</div>
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">时间</th><th className="th">变动</th><th className="th">余额</th><th className="th">原因</th></tr></thead>
              <tbody>
                {data.ledger.map((r: any) => (
                  <tr key={r.id}><td className="td text-ink3">{fmt(r.createdAt)}</td><td className={`td font-bold ${r.delta >= 0 ? "text-ok" : "text-danger"}`}>{r.delta}</td><td className="td">{r.balanceAfter ?? "—"}</td><td className="td"><Tag s={r.reason} /></td></tr>
                ))}
                {data.ledger.length === 0 && <tr><td className="td text-ink3" colSpan={4}>暂无账本</td></tr>}
              </tbody>
            </table></div>
          </div>

          <div className="card overflow-hidden">
            <div className="font-semibold p-5 pb-3">最近发送尝试</div>
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">时间</th><th className="th">通道</th><th className="th">状态</th><th className="th">错误</th></tr></thead>
              <tbody>
                {data.attempts.map((r: any) => (
                  <tr key={r.id}><td className="td text-ink3">{fmt(r.createdAt)}</td><td className="td">{r.provider}</td><td className="td"><Tag s={r.status} /></td><td className="td text-ink3">{r.errorCode ?? "—"}</td></tr>
                ))}
                {data.attempts.length === 0 && <tr><td className="td text-ink3" colSpan={4}>暂无发送尝试</td></tr>}
              </tbody>
            </table></div>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-5">
          <div className="card overflow-hidden">
            <div className="font-semibold p-5 pb-3">发送任务</div>
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">创建时间</th><th className="th">阶段</th><th className="th">状态</th><th className="th">进度</th></tr></thead>
              <tbody>
                {data.jobs.map((r: any) => (
                  <tr key={r.id}><td className="td text-ink3">{fmt(r.createdAt)}</td><td className="td">{r.phase ?? "all"}</td><td className="td"><Tag s={r.status} /></td><td className="td">{r.processed}/{r.total}</td></tr>
                ))}
                {data.jobs.length === 0 && <tr><td className="td text-ink3" colSpan={4}>暂无任务</td></tr>}
              </tbody>
            </table></div>
          </div>

          <div className="card overflow-hidden">
            <div className="font-semibold p-5 pb-3">退订/抑制名单</div>
            <div className="overflow-x-auto"><table className="w-full">
              <thead><tr><th className="th">手机号</th><th className="th">原因</th><th className="th">来源</th><th className="th">时间</th></tr></thead>
              <tbody>
                {data.suppressions.map((r: any) => (
                  <tr key={r.id}><td className="td font-mono">{r.mobile}</td><td className="td"><Tag s={r.reason} /></td><td className="td text-ink3">{r.source ?? "—"}</td><td className="td text-ink3">{fmt(r.createdAt)}</td></tr>
                ))}
                {data.suppressions.length === 0 && <tr><td className="td text-ink3" colSpan={4}>暂无抑制号码</td></tr>}
              </tbody>
            </table></div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">外部事件队列</div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">时间</th><th className="th">事件</th><th className="th">状态</th><th className="th">尝试</th></tr></thead>
            <tbody>
              {data.events.map((r: any) => (
                <tr key={r.id}><td className="td text-ink3">{fmt(r.createdAt)}</td><td className="td">{r.type}</td><td className="td"><Tag s={r.status} /></td><td className="td">{r.attempts}</td></tr>
              ))}
              {data.events.length === 0 && <tr><td className="td text-ink3" colSpan={4}>暂无外部事件</td></tr>}
            </tbody>
          </table></div>
        </div>

        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">账单记录</div>
          <div className="overflow-x-auto"><table className="w-full">
            <thead><tr><th className="th">账单周期</th><th className="th">金额</th><th className="th">状态</th><th className="th">支付时间</th></tr></thead>
            <tbody>
              {invoices.map((inv: any) => (
                <tr key={inv.id}>
                  <td className="td text-ink3">{fmt(inv.periodStart)} ~ {fmt(inv.periodEnd)}</td>
                  <td className="td font-bold">¥{inv.amountYuan}</td>
                  <td className="td"><Tag s={inv.status} /></td>
                  <td className="td text-ink3">{fmt(inv.paidAt)}</td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td className="td text-ink3" colSpan={4}>暂无账单</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
    </>
  );
}

