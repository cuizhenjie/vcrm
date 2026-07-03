import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * 应用健康检查（存活 + 就绪 + DB 连通性）。
 * 供 K8s/Vercel liveness & readiness 探针使用。
 * 返回 200 表示服务可用，503 表示不可用（DB 不可达）。
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    // 轻量 DB 连通性探测
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      uptime: process.uptime(),
      db: "connected",
      latencyMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      {
        status: "unhealthy",
        db: "disconnected",
        error: e instanceof Error ? e.message : String(e),
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
