"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Topbar } from "@/components/ui";
import TiltCard from "@/components/motion/TiltCard";

export default function CanvasListPage() {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/canvas").then((r) => r.json());
    setList(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    const r = await fetch("/api/canvas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "新画布" }) });
    const j = await r.json();
    if (r.ok) window.location.href = `/canvas/${j.id}`;
  };

  const del = async (id: string) => {
    if (!confirm("删除该画布？")) return;
    await fetch(`/api/canvas/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <>
      <Topbar title="创意画布" sub="无限画布 · 营销内容编排工作区">
        <button className="btn btn-pri" onClick={create}>+ 新建画布</button>
      </Topbar>
      <div className="p-4 md:p-6 reveal">
        {loading ? (
          <div className="text-ink3 p-6">加载中…</div>
        ) : list.length === 0 ? (
          <div className="card p-10 text-center text-ink3">
            <div className="text-4xl mb-3">🎨</div>
            <div>还没有画布，点击右上角创建</div>
            <div className="text-xs mt-2">在无限画布上编排文案、图片、视频，触发 AI 视频生成</div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {list.map((c, i) => (
              <TiltCard key={c.id} className="reveal" style={{ "--d": `${i * 70}ms` } as React.CSSProperties}>
                <div className="card card-interactive p-5 h-full cursor-pointer group">
                  <Link href={`/canvas/${c.id}`}>
                    <div className="text-3xl mb-2">🎨</div>
                    <div className="font-medium mb-1 group-hover:text-primary transition-colors">{c.name}</div>
                    <div className="text-xs text-ink3">{new Date(c.updatedAt).toLocaleString("zh-CN")}</div>
                  </Link>
                  <button className="text-xs text-danger hover:underline mt-2" onClick={() => del(c.id)}>删除</button>
                </div>
              </TiltCard>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
