"use client";
import { useEffect, useState, useRef } from "react";

export default function NotificationBell() {
  const [unread, setUnread] = useState(0);
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = async () => {
    const r = await fetch("/api/notifications").then((r) => r.json());
    setUnread(r.unreadCount ?? 0);
    setList(r.list ?? []);
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // 30s 轮询未读数
    return () => clearInterval(t);
  }, []);

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const markAllRead = async () => {
    await fetch("/api/notifications", { method: "PATCH" });
    setUnread(0);
    setList(list.map((n) => ({ ...n, read: true })));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => { setOpen(!open); if (unread > 0) markAllRead(); }}
        className="relative p-1.5 rounded hover:bg-gray-100"
      >
        <span className="text-lg">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-danger text-white text-[10px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-80 bg-white rounded-lg shadow-xl border border-gray-200 z-50 max-h-96 overflow-y-auto">
          <div className="px-4 py-2.5 border-b border-gray-100 font-semibold text-sm flex items-center justify-between">
            <span>通知</span>
            {unread > 0 && <span className="text-xs text-accent">{unread} 条未读</span>}
          </div>
          {list.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">暂无通知</div>
          ) : (
            list.map((n) => (
              <div key={n.id} className={`px-4 py-3 border-b border-gray-50 ${!n.read ? "bg-blue-50/40" : ""}`}>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${n.level === "error" ? "bg-danger" : n.level === "warn" ? "bg-warn" : "bg-accent"}`} />
                  <span className="text-sm font-medium">{n.title}</span>
                  {!n.read && <span className="ml-auto w-2 h-2 rounded-full bg-primary" />}
                </div>
                <div className="text-xs text-gray-500 ml-3.5">{n.body}</div>
                <div className="text-[10px] text-gray-400 ml-3.5 mt-0.5">{new Date(n.createdAt).toLocaleString("zh-CN")}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
