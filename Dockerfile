# ---- 构建阶段 ----
FROM node:20-alpine AS builder
WORKDIR /app

# 仅拷依赖文件，利用缓存
COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
COPY . .

# 生成 Prisma Client + 构建 Next.js
RUN npx prisma generate
RUN npm run build

# ---- 运行阶段 ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
# Next.js standalone 输出（需 next.config 开启，未开则用普通 start）
ENV NEXT_TELEMETRY_DISABLED=1

# 非 root 用户
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/next.config.mjs ./next.config.mjs

USER nextjs
EXPOSE 3000

# 健康检查：每 30s 探测 /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "start"]
