import { db } from "./db";

/**
 * 频控抽象层：同号 N 天内是否已发送。
 *
 * 后端策略（自动选择，无需改码）：
 *   - 配置了 REDIS_URL → 用 Redis SETEX 记录"已发送"标记，TTL = N 天。
 *     高性能、抗高并发，是规模化生产推荐方案。
 *   - 未配置 REDIS_URL → 回退 DB count 查询（兼容现有部署，SQLite/PG 均可）。
 *
 * 发送成功后调用 markSent() 写入标记。
 */

let _redisClient: any = null;
let _redisInitFailed = false;

async function getRedis() {
  if (_redisInitFailed) return null;
  if (_redisClient) return _redisClient;
  const url = process.env.REDIS_URL;
  if (!url) return null;
  try {
    // 动态 import，避免未装 ioredis 时启动报错
    const { Redis } = await import("ioredis");
    _redisClient = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => (times > 2 ? null : Math.min(times * 200, 1000)),
    });
    _redisClient.on("error", (e: Error) => {
      // 只 warn 不永久置位：保留 ioredis 自带重连能力，短暂抖动后自动恢复 Redis
      console.warn("[redis] 连接异常（已回退 DB 频控，重连后自动恢复）", e.message);
    });
    return _redisClient;
  } catch (e) {
    console.warn("[redis] ioredis 不可用，回退 DB 频控。装 ioredis 并配 REDIS_URL 启用。");
    _redisInitFailed = true;
    return null;
  }
}

function redisKey(mobile: string, tenantId: string) {
  return `freq:${tenantId}:${mobile}`;
}

export async function recentlySent(mobile: string, days = 1, tenantId?: string): Promise<boolean> {
  const tid = tenantId ?? "default";
  const redis = await getRedis();
  if (redis && !_redisInitFailed) {
    try {
      const v = await redis.get(redisKey(mobile, tid));
      if (v) return true;
    } catch {
      // 回退 DB
    }
  }
  // DB 回退（原逻辑）
  const since = new Date(Date.now() - days * 86400_000);
  const n = await db.recipient.count({
    where: { mobile, sendStatus: "sent", createdAt: { gte: since }, ...(tenantId ? { tenantId } : {}) },
  });
  return n > 0;
}

/** 发送成功后标记，写入 Redis（TTL）+ DB（由调用方 recipient.update 完成，此处仅 Redis）。 */
export async function markSent(mobile: string, days = 1, tenantId?: string): Promise<void> {
  const tid = tenantId ?? "default";
  const redis = await getRedis();
  if (redis && !_redisInitFailed) {
    try {
      await redis.setex(redisKey(mobile, tid), days * 86400, "1");
    } catch {
      // 忽略，DB 主记录已有
    }
  }
}
