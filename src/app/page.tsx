import { db } from "@/lib/db";
import { leadCounts } from "@/lib/leads";
import { Topbar } from "@/components/ui";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [customers, valid, campaigns, sent, visited, templates, leads] = await Promise.all([
    db.customer.count(),
    db.customer.count({ where: { isBlacklist: false } }),
    db.campaign.count(),
    db.recipient.count({ where: { sendStatus: "sent" } }),
    db.recipient.count({ where: { visited: true } }),
    db.smsTemplate.count({ where: { reportStatus: "approved" } }),
    leadCounts(),
  ]);
  const cards = [
    { k: "客户总数", v: customers, s: `有效 ${valid}`, href: "/customers" },
    { k: "触达任务", v: campaigns, s: "全部任务", href: "/campaigns" },
    { k: "累计发送", v: sent, s: "成功条数", href: "/campaigns" },
    { k: "短链点击", v: visited, s: "已访问客户", href: "/campaigns" },
    { k: "待跟进线索", v: leads.byStatus.new, s: `全部 ${leads.total}`, href: "/leads" },
    { k: "可用模板", v: templates, s: "已报备通过", href: "/templates" },
  ];
  return (
    <>
      <Topbar title="工作台" sub="短信触达概览" />
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3.5 mb-6">
          {cards.map((c) => (
            <Link key={c.k} href={c.href} className="card p-4 hover:shadow-md transition">
              <div className="text-sm text-ink2 mb-2">{c.k}</div>
              <div className="text-3xl font-bold text-primary leading-none">{c.v}</div>
              <div className="text-xs text-ink3 mt-1.5">{c.s}</div>
            </Link>
          ))}
        </div>
        <div className="card p-5">
          <div className="font-semibold mb-2">快速开始</div>
          <ol className="text-sm text-ink2 space-y-1.5 list-decimal pl-5">
            <li><Link href="/customers" className="text-accent">导入客户名单</Link> → 一键号码检测，剔除空号/黑名单</li>
            <li><Link href="/templates" className="text-accent">维护短信模板</Link>（联麓需先报备签名与模板）</li>
            <li><Link href="/campaigns/new" className="text-accent">新建触达任务</Link> → 选模板与名单 → 限速发送</li>
            <li>查看任务详情：发送成功率 / 送达 / 短链点击 / 意图标签</li>
          </ol>
          <p className="text-xs text-ink3 mt-3">当前通道为 <b>{process.env.SMS_PROVIDER ?? "mock"}</b>。配置 <code>SMS_PROVIDER=lianlu</code> 并填入凭证即可切到真实短信通道。</p>
        </div>
      </div>
    </>
  );
}
