export function Topbar({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="h-[58px] bg-white border-b border-line flex items-center gap-3 px-6 sticky top-0 z-20">
      <h1 className="text-base font-semibold">{title}</h1>
      {sub && <span className="text-sm text-ink3">{sub}</span>}
      <div className="flex-1" />
      {children}
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
};
const label: Record<string, string> = {
  approved: "已通过", pending: "待审核", draft: "草稿", rejected: "驳回", done: "已完成", sending: "发送中",
  sent: "已发送", failed: "失败", filtered: "已过滤", stopped: "已停止", checking: "检测中", scheduled: "定时待发", text_sms: "文本短信",
  video_sms: "视频短信", flash: "闪信", text: "文本", mms: "彩信",
  new: "待跟进", following: "跟进中", won: "已成交", lost: "已流失",
};
export function Tag({ s }: { s: string }) {
  return <span className={`tag ${map[s] ?? "bg-gray-100 text-gray-500"}`}>{label[s] ?? s}</span>;
}
