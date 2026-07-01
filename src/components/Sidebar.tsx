"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  { label: "工作台", icon: "⌂", items: [{ href: "/", name: "概览" }] },
  { label: "客户管理", icon: "👥", items: [{ href: "/customers", name: "客户导入" }] },
  { label: "内容与话术", icon: "✎", items: [{ href: "/templates", name: "短信模板" }] },
  { label: "营销触达", icon: "📣", items: [{ href: "/campaigns", name: "触达任务" }, { href: "/leads", name: "线索池" }] },
  { label: "数据中心", icon: "📊", items: [{ href: "/analytics", name: "转化概览" }] },
  { label: "商业化", icon: "￥", items: [{ href: "/settings", name: "租户与计费" }] },
];

export default function Sidebar() {
  const path = usePathname();
  if (path?.startsWith("/login")) return null;
  const logout = async () => { await fetch("/api/logout", { method: "POST" }); window.location.href = "/login"; };
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <aside className="w-52 shrink-0 bg-nav min-h-screen sticky top-0 flex flex-col py-4 text-[#aeb4c6]">
      <div className="px-5 pb-4">
        <div className="text-xl font-bold text-white tracking-wide"><span className="text-primary">V</span>CRM</div>
        <div className="text-[11px] text-[#737b93]">短信触达 · MVP</div>
      </div>
      <nav className="flex-1 px-2.5 space-y-1">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="flex items-center gap-2 px-3 py-2 text-sm"><span className="opacity-80">{g.icon}</span>{g.label}</div>
            {g.items.map((it) => (
              <Link key={it.href} href={it.href}
                className={`block pl-9 pr-3 py-2 text-[13px] rounded-md transition ${active(it.href) ? "text-white bg-navactive font-medium" : "text-[#737b93] hover:text-white hover:bg-navhover"}`}>
                {it.name}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="px-5 pt-3 border-t border-[#262c40]">
        <button onClick={logout} className="text-xs text-[#737b93] hover:text-white">↩ 退出登录</button>
      </div>
    </aside>
  );
}
