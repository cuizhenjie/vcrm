"use client";
import { useEffect, useState } from "react";
import { Topbar, Tag } from "@/components/ui";

export default function CheckPage() {
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const r = await fetch("/api/customer-batches").then((r) => r.json());
    setBatches(Array.isArray(r) ? r : []);
    setLoading(false);
  };
  useEffect(() => {
    load();
    // 有 checking 中的批次时轮询
    const t = setInterval(() => {
      if (batches.some((b) => b.checkStatus === "checking")) load();
    }, 3000);
    return () => clearInterval(t);
  }, [batches.some((b) => b.checkStatus === "checking")]);

  const checkBatch = async (batchId: string) => {
    setBusyId(batchId);
    await fetch("/api/customers/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batchId }),
    });
    setBusyId(null);
    load();
  };

  const checkAll = async () => {
    setBusyId("all");
    await fetch("/api/customers/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    setBusyId(null);
    load();
  };

  const emptyRate = (b: any) => (b.total > 0 ? ((b.emptyCount / b.total) * 100).toFixed(1) : "0");

  return (
    <>
      <Topbar title="手机号检测" sub="空号/停机号识别 · 命中自动拉黑">
        <button className="btn btn-pri" onClick={checkAll} disabled={busyId === "all"}>
          {busyId === "all" ? "检测中…" : "检测全部待检"}
        </button>
      </Topbar>
      <div className="p-6">
        <div className="card overflow-hidden">
          <div className="font-semibold p-5 pb-3">批次检测（{batches.length}）</div>
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">批次名称</th><th className="th">总数</th><th className="th">有效</th><th className="th">空号/黑名单</th><th className="th">空号率</th><th className="th">检测状态</th><th className="th">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="td text-ink3" colSpan={7}>加载中…</td></tr>
              ) : batches.length === 0 ? (
                <tr><td className="td text-ink3" colSpan={7}>暂无批次，请先导入客户名单</td></tr>
              ) : batches.map((b) => (
                <tr key={b.id}>
                  <td className="td font-medium">{b.name}</td>
                  <td className="td">{b.total}</td>
                  <td className="td text-ok">{b.valid}</td>
                  <td className="td text-danger">{b.emptyCount}</td>
                  <td className="td">{emptyRate(b)}%</td>
                  <td className="td"><Tag s={b.checkStatus} /></td>
                  <td className="td">
                    <button
                      className="btn btn-sm"
                      onClick={() => checkBatch(b.id)}
                      disabled={busyId === b.id || b.checkStatus === "checking"}
                    >
                      {b.checkStatus === "checking" ? "检测中…" : b.checkStatus === "done" ? "重新检测" : "检测"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-ink3 mt-3">
          注：空号/停机号会自动标记为黑名单，发送时跳过。检测依赖通道能力，mock 通道按随机率模拟，联麓需配置 LIANLU_CHECK_PATH。
        </div>
      </div>
    </>
  );
}
