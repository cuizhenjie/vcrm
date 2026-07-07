"use client";
import { useEffect, useState } from "react";
import { Topbar } from "@/components/ui";

export default function HealthPage() {
  const [app, setApp] = useState<any>(null);
  const [channel, setChannel] = useState<any>(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setApp);
    fetch("/api/health/channel").then((r) => r.json()).then(setChannel);
  }, []);

  return (
    <>
      <Topbar title="系统健康" sub="服务状态 · 通道自检 · 联调清单" />
      <div className="p-6 space-y-5">
        {/* 应用健康 */}
        <div className="card p-5">
          <div className="font-semibold mb-3">应用状态</div>
          {!app ? (
            <div className="text-ink3">检测中…</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-ink3 mb-1">服务状态</div>
                <span className={`tag ${app.status === "ok" ? "bg-green-50 text-ok" : "bg-red-50 text-danger"}`}>
                  {app.status === "ok" ? "✓ 正常" : "✗ 异常"}
                </span>
              </div>
              <div>
                <div className="text-xs text-ink3 mb-1">数据库</div>
                <span className="text-sm font-medium">{app.db === "connected" ? "✓ 已连接" : "✗ 断开"}</span>
              </div>
              <div>
                <div className="text-xs text-ink3 mb-1">运行时长</div>
                <span className="text-sm">{app.uptime ? `${Math.floor(app.uptime / 60)} 分钟` : "—"}</span>
              </div>
              <div>
                <div className="text-xs text-ink3 mb-1">响应延迟</div>
                <span className="text-sm">{app.latencyMs != null ? `${app.latencyMs}ms` : "—"}</span>
              </div>
            </div>
          )}
        </div>

        {/* 通道自检 */}
        <div className="card p-5">
          <div className="font-semibold mb-3">短信通道</div>
          {!channel ? (
            <div className="text-ink3">检测中…</div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4">
                <span className="text-sm">通道：<b>{channel.provider}</b></span>
                <span className={`tag ${channel.ready ? "bg-green-50 text-ok" : "bg-amber-50 text-warn"}`}>
                  {channel.ready ? "就绪" : "未配置"}
                </span>
              </div>
              {channel.missingEnv?.length > 0 && (
                <div className="text-sm text-danger mb-3">缺失配置：{channel.missingEnv.join(", ")}</div>
              )}
              {channel.balance && (
                <div className="text-sm text-ink2 mb-3">通道余额：<b>{channel.balance.balance ?? "—"}</b></div>
              )}

              {/* 回执闭环检查 */}
              {channel.closedLoop && (
                <div className="mb-4">
                  <div className="text-xs text-ink3 mb-2">回执闭环</div>
                  <div className="space-y-1">
                    <div className="text-sm">{channel.closedLoop.messageIdFieldConfigured ? "✓" : "✗"} 流水号字段（messageId）</div>
                    <div className="text-sm">{channel.closedLoop.webhookSecretConfigured ? "✓" : "✗"} Webhook 签名密钥</div>
                  </div>
                </div>
              )}

              {/* 联调清单 */}
              {channel.checklist && (
                <div>
                  <div className="text-xs text-ink3 mb-2">联调清单</div>
                  <ul className="text-sm space-y-1">
                    {channel.checklist.map((item: string, i: number) => (
                      <li key={i} className={item.startsWith("✓") ? "text-ok" : item.startsWith("!") ? "text-danger" : "text-ink2"}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 全局配置诊断 */}
              {channel.globalDiag && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs text-ink3 mb-2">全局配置诊断</div>
                  <ul className="text-sm space-y-1">
                    {channel.globalDiag.map((item: string, i: number) => (
                      <li key={i} className={item.startsWith("✓") ? "text-ok" : item.startsWith("✗") ? "text-danger" : "text-warn"}>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
