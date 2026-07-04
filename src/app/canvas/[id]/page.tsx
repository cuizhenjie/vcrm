"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeProps,
  Handle, Position,
} from "reactflow";
import "reactflow/dist/style.css";
import { useRouter } from "next/navigation";

/** 文本节点：可编辑的营销文案 */
function TextNode({ data, id }: NodeProps) {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-3 w-56">
      <Handle type="target" position={Position.Top} />
      <div className="text-xs text-gray-400 mb-1">📝 文案</div>
      <textarea
        className="w-full text-sm outline-none resize-none bg-transparent"
        rows={3}
        defaultValue={data.text || "输入营销文案..."}
        onChange={(e) => { data.text = e.target.value; }}
        placeholder="输入营销文案..."
      />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** 视频生成节点：输入 prompt，点击生成触发 /api/video */
function VideoGenNode({ data }: NodeProps) {
  const [status, setStatus] = useState(data.status || "idle");
  const [videoUrl, setVideoUrl] = useState(data.videoUrl || "");
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  // 组件卸载时清理轮询定时器，防泄漏
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const generate = async () => {
    setBusy(true); setStatus("queued");
    data.status = "queued";
    const r = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: data.prompt || "" }),
    });
    const j = await r.json();
    if (!r.ok) { setStatus("failed"); setBusy(false); return; }
    // 轮询（卸载时通过 cancelledRef 中断）
    const poll = async () => {
      if (cancelledRef.current) return;
      const s = await fetch(`/api/video/${j.taskId}`).then((r) => r.json());
      if (cancelledRef.current) return;
      if (s.status === "succeeded") {
        setStatus("succeeded"); setVideoUrl(s.videoUrl); data.status = "succeeded"; data.videoUrl = s.videoUrl; setBusy(false);
      } else if (s.status === "failed") {
        setStatus("failed"); data.status = "failed"; setBusy(false);
      } else {
        pollRef.current = setTimeout(poll, 5000);
      }
    };
    pollRef.current = setTimeout(poll, 5000);
  };

  return (
    <div className="bg-violet-50 rounded-lg shadow border border-violet-200 p-3 w-60">
      <Handle type="target" position={Position.Top} />
      <div className="text-xs text-violet-500 mb-1">🎬 视频生成</div>
      <textarea
        className="w-full text-sm outline-none resize-none bg-white/50 rounded p-1.5"
        rows={3}
        defaultValue={data.prompt || ""}
        onChange={(e) => { data.prompt = e.target.value; }}
        placeholder="视频描述（prompt）..."
      />
      {videoUrl && (
        <video src={videoUrl} className="w-full mt-2 rounded" controls muted />
      )}
      <button
        className="btn btn-pri w-full mt-2 text-xs"
        onClick={generate}
        disabled={busy}
      >
        {busy ? `${status}…` : videoUrl ? "重新生成" : "生成视频"}
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

/** 图片节点：展示一张图片 URL */
function ImageNode({ data }: NodeProps) {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-2 w-40">
      <Handle type="target" position={Position.Top} />
      <div className="text-xs text-gray-400 mb-1">🖼 图片</div>
      {data.url ? (
        <img src={data.url} className="w-full rounded" alt="" />
      ) : (
        <input
          className="w-full text-xs outline-none border-b border-gray-200"
          placeholder="图片 URL"
          onChange={(e) => { data.url = e.target.value; }}
        />
      )}
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

const nodeTypes = { text: TextNode, videoGen: VideoGenNode, image: ImageNode };

export default function CanvasEditor({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loaded, setLoaded] = useState(false);
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onConnect = useCallback((c: Connection) => setEdges((eds: Edge[]) => addEdge(c, eds)), [setEdges]);

  useEffect(() => {
    fetch(`/api/canvas/${params.id}`).then((r) => r.json()).then((c) => {
      if (c.error) { router.push("/canvas"); return; }
      setName(c.name);
      try {
        const data = JSON.parse(c.dataJson || '{"nodes":[],"edges":[]}');
        setNodes(data.nodes || []);
        setEdges(data.edges || []);
      } catch { /* 空画布 */ }
      setLoaded(true);
    });
  }, [params.id]);

  // 自动保存（debounce）
  useEffect(() => {
    if (!loaded) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      // 提取节点 data（reactflow 内部结构需清理）
      const cleanNodes = nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data }));
      const cleanEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
      await fetch(`/api/canvas/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dataJson: JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }) }),
      });
    }, 1500);
  }, [nodes, edges, name, loaded, params.id]);

  const addNode = (type: string) => {
    const id = `${type}_${Date.now()}`;
    const newNode: Node = {
      id,
      type,
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: type === "videoGen" ? { prompt: "" } : type === "image" ? { url: "" } : { text: "" },
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
  };

  if (!loaded) return <div className="p-6 text-ink3">加载画布…</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="h-12 bg-white border-b border-line flex items-center gap-3 px-4 shrink-0">
        <button onClick={() => router.push("/canvas")} className="text-sm text-ink3 hover:text-primary">← 画布列表</button>
        <input
          className="text-sm font-medium outline-none border-b border-transparent hover:border-line focus:border-primary px-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <span className="text-xs text-ink3 ml-auto">💾 自动保存</span>
      </div>
      <div className="flex-1 flex">
        <div className="w-44 bg-white border-r border-line p-3 space-y-2 shrink-0">
          <div className="text-xs text-ink3 mb-2">添加节点</div>
          <button className="btn w-full text-xs" onClick={() => addNode("text")}>📝 文案</button>
          <button className="btn w-full text-xs" onClick={() => addNode("image")}>🖼 图片</button>
          <button className="btn w-full text-xs" onClick={() => addNode("videoGen")}>🎬 视频生成</button>
        </div>
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            className="bg-gray-50"
          >
            <Background />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
