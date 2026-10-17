"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const groups = [
  { label: "工作台", icon: "⌂", items: [{ href: "/", name: "概览" }] },
  { label: "客户管理", icon: "👥", items: [{ href: "/customers", name: "客户导入" }, { href: "/customers/check", name: "手机号检测" }] },
  { label: "内容与话术", icon: "✎", items: [{ href: "/templates", name: "短信模板" }, { href: "/signatures", name: "短信签名" }] },
  { label: "营销触达", icon: "📣", items: [{ href: "/campaigns", name: "触达任务" }, { href: "/leads", name: "线索池" }, { href: "/video", name: "视频生成" }, { href: "/canvas", name: "创意画布" }] },
  { label: "数据中心", icon: "📊", items: [{ href: "/analytics", name: "转化概览" }, { href: "/reports", name: "消息回执" }] },
  { label: "商业化", icon: "￥", items: [
    { href: "/settings", name: "租户与计费" },
    { href: "/pricing", name: "套餐定价" },
    { href: "/recharge", name: "额度充值" },
  ] },
  { label: "团队与系统", icon: "⚙", items: [
    { href: "/members", name: "成员管理" },
    { href: "/sensitive-words", name: "敏感词库" },
    { href: "/intent-keywords", name: "意图词库" },
    { href: "/webhooks", name: "Webhook 配置" },
    { href: "/health", name: "系统健康" },
  ] },
];

// Topbar 汉堡按钮与本组件通信的全局事件
export const NAV_TOGGLE = "vcrm:nav-toggle";

export default function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false); // 移动端抽屉
  const standalone = !!path && ["/login", "/register", "/pay/mock", "/landing"].some((p) => path.startsWith(p));

  // 抽屉开合：监听 Topbar 事件；路由切换/Escape 关闭；开启时锁定背景滚动
  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener(NAV_TOGGLE, toggle);
    return () => window.removeEventListener(NAV_TOGGLE, toggle);
  }, []);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", esc);
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [open]);

  // 独立页（登录/注册/支付收银台）不渲染侧边栏，走全屏居中布局
  if (standalone) return null;
  // sendBeacon：页面跳转期间也能可靠送达的同源登出请求（fire-and-forget）
  const logout = () => { navigator.sendBeacon("/api/logout"); window.location.href = "/login"; };
  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));

  const nav = (
    <>
      <div className="px-5 pb-4">
        <div className="text-xl font-bold text-white tracking-wide"><span className="text-primary">V</span>CRM</div>
        <div className="text-[11px] text-[#737b93]">短信触达 · MVP</div>
      </div>
      <nav className="flex-1 px-2.5 space-y-1 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="flex items-center gap-2 px-3 py-2 text-sm"><span className="opacity-80">{g.icon}</span>{g.label}</div>
            {g.items.map((it) => (
              <Link key={it.href} href={it.href}
                className={`block pl-9 pr-3 py-2 text-[13px] rounded-md transition-colors duration-150 ${active(it.href) ? "text-white bg-navactive font-medium" : "text-[#737b93] hover:text-white hover:bg-navhover"}`}>
                {it.name}
              </Link>
            ))}
          </div>
        ))}
      </nav>
      <div className="px-5 pt-3 border-t border-[#262c40]">
        <button onClick={logout} className="text-xs text-[#737b93] hover:text-white transition-colors">↩ 退出登录</button>
      </div>
    </>
  );

  return (
    <>
      {/* 桌面侧边栏 */}
      <aside className="hidden lg:flex w-52 shrink-0 bg-nav/95 backdrop-blur-sm h-screen sticky top-0 flex-col py-4 text-[#aeb4c6] border-r border-black/20">
        {nav}
      </aside>

      {/* 移动端抽屉 + 遮罩（transform 合成层动画） */}
      <div className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setOpen(false)} aria-hidden="true">
        <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
      </div>
      <aside className={`fixed inset-y-0 left-0 z-50 lg:hidden w-64 bg-nav flex flex-col py-4 text-[#aeb4c6] shadow-2xl
        transition-transform duration-300 ease-[cubic-bezier(0.22,0.8,0.3,1)] ${open ? "translate-x-0" : "-translate-x-full"}`}
        aria-label="导航菜单" aria-hidden={!open}>
        <button onClick={() => setOpen(false)} aria-label="关闭菜单"
          className="absolute top-4 right-3 w-8 h-8 rounded-md text-[#737b93] hover:text-white hover:bg-navhover flex items-center justify-center transition-colors">✕</button>
        {nav}
      </aside>
    </>
  );
}
