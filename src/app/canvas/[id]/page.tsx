"use client";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import ReactFlow, {
  Background, Controls, MiniMap,
  addEdge, useNodesState, useEdgesState,
  type Node, type Edge, type Connection, type NodeProps, type NodeChange,
  Handle, Position, MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";
import { useRouter } from "next/navigation";

// ============ 节点 data 更新工具 ============
// 关键修复：节点内部编辑必须通过 setNodes 更新 data 引用，而非直接 mutate。
// 否则 nodes 引用不变 → autosave 不触发 → 编辑内容刷新后丢失。

/** 创建一个 updateNodeData 函数，供节点通过 props 调用以受控更新自己的 data。 */
function useUpdateNodeData(setNodes: ReturnType<typeof useNodesState>[1]) {
  return useCallback((nodeId: string, patch: Record<string, unknown>) => {
    setNodes((nds: Node[]) =>
      nds.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
    );
  }, [setNodes]);
}

// ============ 文本节点 ============
function TextNode({ data, onUpdate }: NodeProps & { onUpdate?: (patch: Record<string, unknown>) => void }) {
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-3 w-56">
      <Handle type="target" position={Position.Top} />
      <div className="text-xs text-gray-400 mb-1">📝 文案</div>
      <textarea
        className="w-full text-sm outline-none resize-none bg-transparent"
        rows={3}
        value={data.text || ""}
        onChange={(e) => onUpdate?.({ text: e.target.value })}
        placeholder="输入营销文案..."
      />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ============ 视频生成节点 ============
function VideoGenNode({ data, onUpdate }: NodeProps & { onUpdate?: (patch: Record<string, unknown>) => void }) {
  const [status, setStatus] = useState(data.status || "idle");
  const [videoUrl, setVideoUrl] = useState(data.videoUrl || "");
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const update = (patch: Record<string, unknown>) => {
    onUpdate?.(patch);
  };

  const generate = async () => {
    setBusy(true); setStatus("queued");
    update({ status: "queued" });
    const r = await fetch("/api/video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: data.prompt || "" }),
    });
    const j = await r.json();
    if (!r.ok) { setStatus("failed"); update({ status: "failed" }); setBusy(false); return; }
    const poll = async () => {
      if (cancelledRef.current) return;
      const s = await fetch(`/api/video/${j.taskId}`).then((r) => r.json());
      if (cancelledRef.current) return;
      if (s.status === "succeeded") {
        setStatus("succeeded"); setVideoUrl(s.videoUrl);
        update({ status: "succeeded", videoUrl: s.videoUrl }); // 关键：写回 data 触发保存
        setBusy(false);
      } else if (s.status === "failed") {
        setStatus("failed"); update({ status: "failed" }); setBusy(false);
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
        value={data.prompt || ""}
        onChange={(e) => update({ prompt: e.target.value })}
        placeholder="视频描述（prompt）..."
      />
      {videoUrl && <video src={videoUrl} className="w-full mt-2 rounded" controls muted />}
      <button className="btn btn-pri w-full mt-2 text-xs" onClick={generate} disabled={busy}>
        {busy ? `${status}…` : videoUrl ? "重新生成" : "生成视频"}
      </button>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ============ 图片节点 ============
function ImageNode({ data, onUpdate }: NodeProps & { onUpdate?: (patch: Record<string, unknown>) => void }) {
  const update = (patch: Record<string, unknown>) => onUpdate?.(patch);
  return (
    <div className="bg-white rounded-lg shadow border border-gray-200 p-2 w-40">
      <Handle type="target" position={Position.Top} />
      <div className="text-xs text-gray-400 mb-1">🖼 图片</div>
      {data.url ? (
        <img src={data.url} className="w-full rounded" alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      ) : null}
      <input
        className="w-full text-xs outline-none border-b border-gray-200 mt-1"
        placeholder="图片 URL"
        value={data.url || ""}
        onChange={(e) => update({ url: e.target.value })}
      />
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

// ============ 节点类型注册（注入 onUpdate） ============
function makeNodeTypes(updateNodeData: (id: string, patch: Record<string, unknown>) => void) {
  const wrap = (Comp: React.ComponentType<any>) => (props: NodeProps) => (
    <Comp {...props} onUpdate={(patch: Record<string, unknown>) => updateNodeData(props.id, patch)} />
  );
  return { text: wrap(TextNode), videoGen: wrap(VideoGenNode), image: wrap(ImageNode) };
}

// ============ 主编辑器 ============
export default function CanvasEditor({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loaded, setLoaded] = useState(false);
  const saveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 撤销/重做历史栈
  const histRef = useRef<{ past: { nodes: Node[]; edges: Edge[] }[]; future: { nodes: Node[]; edges: Edge[] }[] }>(
    { past: [], future: [] },
  );
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const updateNodeData = useUpdateNodeData(setNodes);
  const nodeTypes = useMemo(() => makeNodeTypes(updateNodeData), [updateNodeData]);

  const onConnect = useCallback((c: Connection) => setEdges((eds: Edge[]) => addEdge({ ...c, animated: true }, eds)), [setEdges]);

  // 加载画布
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

  // 快照到历史栈（用于撤销/重做），去抖避免拖动时过多快照
  const snapshot = useCallback(() => {
    histRef.current.past.push({ nodes, edges });
    if (histRef.current.past.length > 50) histRef.current.past.shift();
    histRef.current.future = [];
    setCanUndo(histRef.current.past.length > 0);
    setCanRedo(false);
  }, [nodes, edges]);

  // 自动保存（debounce 1.5s）—— nodes/edges 引用变化即触发（含 data 更新）
  useEffect(() => {
    if (!loaded) return;
    if (saveRef.current) clearTimeout(saveRef.current);
    saveRef.current = setTimeout(async () => {
      const cleanNodes = nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: n.data }));
      const cleanEdges = edges.map((e) => ({ id: e.id, source: e.source, target: e.target }));
      await fetch(`/api/canvas/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, dataJson: JSON.stringify({ nodes: cleanNodes, edges: cleanEdges }) }),
      });
    }, 1500);
  }, [nodes, edges, name, loaded, params.id]);

  // 添加节点
  const addNode = (type: string) => {
    snapshot();
    const id = `${type}_${Date.now()}`;
    const center = { x: 150 + Math.random() * 150, y: 100 + Math.random() * 150 };
    const newNode: Node = {
      id, type, position: center,
      data: type === "videoGen" ? { prompt: "" } : type === "image" ? { url: "" } : { text: "" },
    };
    setNodes((nds: Node[]) => [...nds, newNode]);
  };

  // 复制选中节点（Cmd+C/V）
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const clipboardRef = useRef<Node[]>([]);

  const onSelectionChange = useCallback(({ nodes: sel }: { nodes: Node[] }) => {
    setSelectedIds(sel.map((n) => n.id));
  }, []);

  // 键盘快捷键
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inEditable = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement)?.isContentEditable;
      // Cmd/Ctrl+Z 撤销
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault(); undo();
      }
      // Cmd/Ctrl+Shift+Z 或 Cmd/Ctrl+Y 重做
      if (((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) || ((e.metaKey || e.ctrlKey) && e.key === "y")) {
        e.preventDefault(); redo();
      }
      // Cmd/Ctrl+C 复制选中（排除 input/textarea 聚焦——让系统复制生效）
      if ((e.metaKey || e.ctrlKey) && e.key === "c" && selectedIds.length > 0 && !inEditable) {
        clipboardRef.current = nodes.filter((n) => selectedIds.includes(n.id));
      }
      // Cmd/Ctrl+V 粘贴（排除 input/textarea 聚焦——让系统粘贴生效）
      if ((e.metaKey || e.ctrlKey) && e.key === "v" && clipboardRef.current.length > 0 && !inEditable) {
        snapshot();
        const pasted = clipboardRef.current.map((n) => ({
          ...n, id: `${n.type}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          selected: false,
        }));
        setNodes((nds) => [...nds, ...pasted]);
      }
      // Delete 删除选中（排除 input/textarea/contenteditable）
      if ((e.key === "Delete" || e.key === "Backspace") && !inEditable) {
        if (selectedIds.length > 0) {
          e.preventDefault(); snapshot();
          setNodes((nds) => nds.filter((n) => !selectedIds.includes(n.id)));
          setEdges((eds) => eds.filter((ed) => !selectedIds.includes(ed.source) && !selectedIds.includes(ed.target)));
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [nodes, edges, selectedIds]);

  const undo = () => {
    const hist = histRef.current;
    if (hist.past.length === 0) return;
    const prev = hist.past.pop()!;
    hist.future.push({ nodes, edges });
    setNodes(prev.nodes); setEdges(prev.edges);
    setCanUndo(hist.past.length > 0); setCanRedo(true);
  };
  const redo = () => {
    const hist = histRef.current;
    if (hist.future.length === 0) return;
    const next = hist.future.pop()!;
    hist.past.push({ nodes, edges });
    setNodes(next.nodes); setEdges(next.edges);
    setCanUndo(true); setCanRedo(hist.future.length > 0);
  };

  if (!loaded) return <div className="p-6 text-ink3">加载画布…</div>;

  return (
    <div className="h-screen flex flex-col">
      <div className="h-12 bg-white border-b border-line flex items-center gap-2 px-4 shrink-0">
        <button onClick={() => router.push("/canvas")} className="text-sm text-ink3 hover:text-primary">← 画布列表</button>
        <input
          className="text-sm font-medium outline-none border-b border-transparent hover:border-line focus:border-primary px-1"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <div className="flex items-center gap-1 ml-2">
          <button onClick={undo} disabled={!canUndo} className="p-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed" title="撤销 (Cmd+Z)">↶</button>
          <button onClick={redo} disabled={!canRedo} className="p-1 text-sm rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed" title="重做 (Cmd+Shift+Z)">↷</button>
        </div>
        <span className="text-xs text-ink3 ml-auto">💾 自动保存 · ⌨️ Del删除·Cmd+C/V复制粘贴·Cmd+Z撤销</span>
      </div>
      <div className="flex-1 flex">
        <div className="w-44 bg-white border-r border-line p-3 space-y-2 shrink-0">
          <div className="text-xs text-ink3 mb-2">添加节点</div>
          <button className="btn w-full text-xs" onClick={() => addNode("text")}>📝 文案</button>
          <button className="btn w-full text-xs" onClick={() => addNode("image")}>🖼 图片</button>
          <button className="btn w-full text-xs" onClick={() => addNode("videoGen")}>🎬 视频生成</button>
          <div className="text-xs text-ink3 mt-4 mb-1">画布操作</div>
          <button className="btn w-full text-xs" onClick={() => { snapshot(); setNodes([]); setEdges([]); }}>🗑 清空</button>
        </div>
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectionChange={onSelectionChange}
            onNodeDragStop={snapshot}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={null}
            className="bg-gray-50"
            defaultEdgeOptions={{ markerEnd: { type: MarkerType.ArrowClosed }, style: { stroke: "#cbd5e1" } }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap nodeColor={(n) => (n.type === "videoGen" ? "#c4b5fd" : n.type === "image" ? "#bfdbfe" : "#ddd")} />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
