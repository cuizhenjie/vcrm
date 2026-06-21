import { PrismaClient } from "@prisma/client";
// 开发环境热重载下复用单例，避免连接数爆炸
const g = globalThis as unknown as { prisma?: PrismaClient };
export const db = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = db;
