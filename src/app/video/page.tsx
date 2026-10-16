"use client";
import { useEffect, useState, useRef } from "react";
import { Topbar, Tag } from "@/components/ui";

export default function VideoPage() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [prompt, setPrompt] = useState("");
  const [resolution, setResolution] = useState("1080p");
  const [duration, setDuration] = useState(5);
  const [ratio, setRatio] = useState("16:9");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = async () => {
    const r = await fetch("/api/video").then((r) => r.json());
    setTasks(Array.isArray(r) ? r : []);
  };
  useEffect(() => {
    load();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // 有进行中任务时轮询（cancelled/succeeded/failed 均为终态，不再轮询）
  useEffect(() => {
    const hasPending = tasks.some((t) => t.status === "queued" || t.status === "running");
    if (hasPending && !pollRef.current) {
      pollRef.current = setInterval(load, 5000);
    } else if (!hasPending && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, [tasks]);

  const generate = async () => {
    if (!prompt.trim()) return;
    setBusy(true); setErr("");
    const r = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, params: { resolution, duration, ratio } }),
    });
    const j = await r.json();
    setBusy(false);
    if (!r.ok) { setErr(j.error || "生成失败"); return; }
    setPrompt("");
    load();
  };

  // 取消/删除任务（进行中→取消并退额；终态→标记删除）
  const cancelTask = async (id: string) => {
    if (!confirm("确认取消/删除该视频任务？进行中的任务将停止生成并退还额度。")) return;
    const r = await fetch(`/api/video/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      setErr(j.error || "操作失败");
      return;
    }
    load();
  };

  return (
    <>
      <Topbar title="营销视频生成" sub="AI 视频创作 · 火山方舟 Seedance" />
      <div className="p-4 md:p-6 grid md:grid-cols-[360px_1fr] gap-5 reveal">
        <div className="card p-5 h-fit space-y-3">
          <div className="font-semibold">创作视频</div>
          <textarea
            className="input !h-32 py-2"
            placeholder="描述你想生成的营销视频画面，如：阳光下金色咖啡豆特写，慢动作倒入热牛奶，品牌 logo 淡入，电影级质感"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-ink3 block mb-1">分辨率</label>
              <select className="input" value={resolution} onChange={(e) => setResolution(e.target.value)}>
                <option value="480p">480p</option>
                <option value="720p">720p</option>
                <option value="1080p">1080p</option>
                <option value="4k">4K</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink3 block mb-1">时长(秒)</label>
              <select className="input" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                <option value={4}>4s</option>
                <option value={5}>5s</option>
                <option value={10}>10s</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-ink3 block mb-1">画幅</label>
              <select className="input" value={ratio} onChange={(e) => setRatio(e.target.value)}>
                <option value="16:9">16:9 横</option>
                <option value="9:16">9:16 竖</option>
                <option value="1:1">1:1 方</option>
              </select>
            </div>
          </div>
          {err && <div className="text-sm text-danger">{err}</div>}
          <button className="btn btn-pri w-full" onClick={generate} disabled={busy}>
            {busy ? "提交中…" : "生成视频"}
          </button>
          <div className="text-xs text-ink3">
            生成约需 1-3 分钟。视频链接有效期 24 小时，请及时下载保存。
          </div>
        </div>

        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="card p-10 text-center text-ink3">还没有视频任务，在左侧输入描述开始创作</div>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="card overflow-hidden">
                <div className="flex gap-4 p-4">
                  {/* 视频预览 / 缩略图 / 占位 */}
                  <div className="w-40 h-24 shrink-0 rounded-lg overflow-hidden bg-gray-100 flex items-center justify-center">
                    {t.status === "succeeded" && t.videoUrl ? (
                      <video src={t.videoUrl} className="w-full h-full object-cover" controls muted />
                    ) : t.thumbnailUrl ? (
                      <img src={t.thumbnailUrl} className="w-full h-full object-cover" alt="" />
                    ) : (
                      <span className="text-3xl text-gray-300">
                        {t.status === "failed" ? "✗" : t.status === "cancelled" ? "⊘" : "⏳"}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Tag s={t.status} />
                      <span className="text-xs text-ink3">{new Date(t.createdAt).toLocaleString("zh-CN")}</span>
                      {/* 取消/删除按钮：进行中可取消，已终态可删除 */}
                      {(t.status === "queued" || t.status === "running" || t.status === "failed" || t.status === "succeeded") && (
                        <button
                          onClick={() => cancelTask(t.id)}
                          className="ml-auto text-xs text-ink3 hover:text-danger transition-colors"
                          title={t.status === "queued" || t.status === "running" ? "取消任务" : "删除记录"}
                        >
                          {t.status === "queued" || t.status === "running" ? "取消" : "删除"}
                        </button>
                      )}
                    </div>
                    <div className="text-sm text-ink2 line-clamp-2 mb-1">{t.prompt}</div>
                    {t.error && t.status !== "cancelled" && <div className="text-xs text-danger">错误：{t.error}</div>}
                    <div className="text-xs text-ink3">
                      {t.model} · {t.paramsJson ? (() => { try { const p = JSON.parse(t.paramsJson); return `${p.resolution}·${p.duration}s·${p.ratio}`; } catch { return ""; } })() : ""}
                    </div>
                    {t.status === "succeeded" && t.videoUrl && (
                      <a href={t.videoUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline mt-1 inline-block">
                        ⬇ 下载视频
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
