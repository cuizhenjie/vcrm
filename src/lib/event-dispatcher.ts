import crypto from "node:crypto";
import { db } from "./db";

/**
 * OutboundEvent 投递器：把 pending 事件推送到租户配置的 WebhookEndpoint。
 *
 * 之前 emitOutboundEvent 只写 pending 不消费，导致：
 * 1) message.clicked / lead.won / customer.unsubscribed 等事件永远到不了客户 CRM
 * 2) OutboundEvent 表无限增长
 *
 * 本投递器：扫描 pending 事件 → 按租户找 active endpoint → 匹配事件类型 →
 * HMAC-SHA256 签名 POST → 标记 delivered/failed（含重试上限）。
 * 由 /api/cron/tick 调用（与定时发送共用 cron 入口）。
 */

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 20;
const TIMEOUT_MS = 5000;

export async function dispatchOutboundEvents(): Promise<{ dispatched: number; failed: number; retried: number; skipped: number }> {
  const stats = { dispatched: 0, failed: 0, retried: 0, skipped: 0 };

  // 原子领取：用条件 updateMany 抢占一批 pending→sending，防止多 cron tick 并发重复投递
  // SQLite 下 updateMany 是原子的，并发 tick 只有一个能成功抢占同一批
  const candidates = await db.outboundEvent.findMany({
    where: { status: "pending", attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { createdAt: "asc" },
    take: BATCH_SIZE,
    select: { id: true },
  });
  if (candidates.length === 0) return stats;

  const claimed = await db.outboundEvent.updateMany({
    where: { id: { in: candidates.map((c) => c.id) }, status: "pending" },
    data: { status: "sending" },
  });
  if (claimed.count === 0) return stats; // 被并发 tick 抢走

  // 重新读取已领取的事件
  const events = await db.outboundEvent.findMany({
    where: { status: "sending", id: { in: candidates.map((c) => c.id) } },
    orderBy: { createdAt: "asc" },
  });

  // 按租户分组缓存 endpoint 配置，避免逐条查
  const endpointCache = new Map<string, Awaited<ReturnType<typeof fetchEndpoints>>>();
  for (const ev of events) {
    const endpoints = endpointCache.get(ev.tenantId) ?? (await fetchEndpoints(ev.tenantId));
    endpointCache.set(ev.tenantId, endpoints);

    const matched = endpoints.filter((ep) => ep.eventTypes.includes(ev.type));
    if (matched.length === 0) {
      // 无匹配 endpoint：记录告警后标记 delivered（防表无限增长，但提示配置问题）
      console.warn(`[event-dispatcher] 无匹配 endpoint，事件被跳过 tenant=${ev.tenantId} type=${ev.type}`);
      await db.outboundEvent.update({
        where: { id: ev.id },
        data: { status: "delivered", deliveredAt: new Date(), lastError: "no_matching_endpoint" },
      });
      stats.skipped++;
      continue;
    }

    // 并发投递到所有匹配 endpoint
    const results = await Promise.allSettled(
      matched.map((ep) => postToEndpoint(ep, ev)),
    );
    const allOk = results.every((r) => r.status === "fulfilled" && r.value);
    const nextAttempts = ev.attempts + 1;
    if (allOk) {
      await db.outboundEvent.update({
        where: { id: ev.id },
        data: { status: "delivered", attempts: nextAttempts, deliveredAt: new Date() },
      });
      stats.dispatched++;
    } else if (nextAttempts >= MAX_ATTEMPTS) {
      // 超过最大重试次数 → 彻底失败
      await db.outboundEvent.update({
        where: { id: ev.id },
        data: { status: "failed", attempts: nextAttempts, lastError: extractError(results) },
      });
      stats.failed++;
    } else {
      // 待重试（区分于彻底失败，监控口径准确）
      await db.outboundEvent.update({
        where: { id: ev.id },
        data: { status: "pending", attempts: nextAttempts, lastError: extractError(results) },
      });
      stats.retried++;
    }
  }

  return stats;
}

type Endpoint = { id: string; url: string; secret: string | null };

async function fetchEndpoints(tenantId: string): Promise<Array<Endpoint & { eventTypes: string[] }>> {
  const rows = await db.webhookEndpoint.findMany({
    where: { tenantId, status: "active" },
    select: { id: true, url: true, secret: true, eventTypes: true },
  });
  return rows.map((r) => {
    let types: string[] = [];
    try {
      types = JSON.parse(r.eventTypes);
    } catch {
      types = [];
    }
    return { ...r, eventTypes: Array.isArray(types) ? types : [] };
  });
}

async function postToEndpoint(ep: Endpoint, ev: { id: string; type: string; payloadJson: string }): Promise<boolean> {
  const body = JSON.stringify({ id: ev.id, type: ev.type, data: safeParse(ev.payloadJson), timestamp: new Date().toISOString() });
  const signature = ep.secret
    ? crypto.createHmac("sha256", ep.secret).update(body, "utf8").digest("hex")
    : undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ep.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-VCRM-Event": ev.type,
        ...(signature ? { "X-VCRM-Signature": signature } : {}),
      },
      body,
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const safeParse = (s: string): unknown => {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
};

const extractError = (results: PromiseSettledResult<boolean>[]): string => {
  const failed = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
  if (failed) return String(failed.reason).slice(0, 300);
  const falsy = results.find((r) => r.status === "fulfilled" && !r.value);
  return falsy ? "endpoint returned non-ok" : "unknown";
};
