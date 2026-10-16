"use client";
import NotificationBell from "./NotificationBell";
import { NAV_TOGGLE } from "./Sidebar";

export function Topbar({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="h-14 md:h-[58px] bg-white/85 backdrop-blur-md border-b border-line flex items-center gap-3 px-4 md:px-6 sticky top-0 z-30">
      {/* 移动端汉堡菜单（事件驱动 Sidebar 抽屉） */}
      <button
        aria-label="打开导航菜单"
        onClick={() => window.dispatchEvent(new Event(NAV_TOGGLE))}
        className="lg:hidden -ml-1.5 w-9 h-9 rounded-lg hover:bg-gray-100 active:scale-95 transition flex items-center justify-center text-ink2"
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M2 4.5h14M2 9h14M2 13.5h14" />
        </svg>
      </button>
      <h1 className="text-base font-semibold truncate max-w-[45vw] md:max-w-none">{title}</h1>
      {sub && <span className="text-sm text-ink3 truncate hidden sm:inline">{sub}</span>}
      <div className="flex-1" />
      {children}
      <NotificationBell />
    </div>
  );
}
const map: Record<string, string> = {
  approved: "bg-green-50 text-ok", pending: "bg-amber-50 text-warn", draft: "bg-gray-100 text-gray-500",
  rejected: "bg-red-50 text-danger", done: "bg-green-50 text-ok", sending: "bg-blue-50 text-accent",
  sent: "bg-green-50 text-ok", failed: "bg-red-50 text-danger", filtered: "bg-gray-100 text-gray-500",
  stopped: "bg-red-50 text-danger", checking: "bg-blue-50 text-accent", scheduled: "bg-violet-50 text-primary",
  有意向: "bg-green-50 text-ok", 无意向: "bg-red-50 text-danger", 未表态: "bg-gray-100 text-gray-500",
  new: "bg-amber-50 text-warn", following: "bg-blue-50 text-accent", won: "bg-green-50 text-ok", lost: "bg-gray-100 text-gray-500",
  // 新增状态（敏感词/webhook/事件/计费）
  active: "bg-green-50 text-ok", inactive: "bg-gray-100 text-gray-500",
  delivered: "bg-green-50 text-ok", refunded: "bg-gray-100 text-gray-500",
  billable: "bg-blue-50 text-accent", reserved: "bg-amber-50 text-warn",
  blocked: "bg-red-50 text-danger", deferred: "bg-violet-50 text-primary", passed: "bg-green-50 text-ok",
  trialing: "bg-blue-50 text-accent", past_due: "bg-red-50 text-danger", canceled: "bg-gray-100 text-gray-500",
  // 视频生成任务状态
  queued: "bg-amber-50 text-warn", running: "bg-blue-50 text-accent", succeeded: "bg-green-50 text-ok",
  cancelled: "bg-gray-100 text-gray-500",
};
const label: Record<string, string> = {
  approved: "已通过", pending: "待审核", draft: "草稿", rejected: "驳回", done: "已完成", sending: "发送中",
  sent: "已发送", failed: "失败", filtered: "已过滤", stopped: "已停止", checking: "检测中", scheduled: "定时待发", text_sms: "文本短信",
  video_sms: "视频短信", flash: "闪信", text: "文本", mms: "彩信",
  new: "待跟进", following: "跟进中", won: "已成交", lost: "已流失",
  // 新增标签
  active: "启用", inactive: "停用", delivered: "已送达", refunded: "已退款",
  billable: "已计费", reserved: "已预扣", blocked: "已阻断", deferred: "已顺延", passed: "已通过",
  trialing: "试用中", past_due: "逾期", canceled: "已取消",
  // 视频生成任务状态
  queued: "排队中", running: "生成中", succeeded: "已完成", cancelled: "已取消",
};
export function Tag({ s }: { s: string }) {
  return <span className={`tag ${map[s] ?? "bg-gray-100 text-gray-500"}`}>{label[s] ?? s}</span>;
}
