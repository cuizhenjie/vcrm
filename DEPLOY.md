# 部署指南

## 本地开发（SQLite，零配置）

```bash
cp .env.example .env
# 编辑 .env：至少改 AUTH_SECRET（openssl rand -hex 32）、APP_PASSWORD
npm install
npm run setup        # prisma db push + seed
npm run dev
```

## 生产部署（PostgreSQL 推荐）

### 1. 切换数据库到 PostgreSQL

Prisma 的 datasource provider 是字面量，不能运行时切换。生产切 PG 步骤：

```bash
# 把 prisma/schema.prisma 第 8 行的：
#   provider = "sqlite"
# 改为：
#   provider = "postgresql"
# DATABASE_URL 改为 PG 连接串，例如：
#   DATABASE_URL="postgresql://user:pass@host:5432/vcrm?schema=public"
npx prisma migrate dev --name init   # 生成并应用 PG 迁移
npx prisma db seed                   # 灌种子数据
```

> `prisma/migrations/0_init/migration.sql` 是 SQLite 版初始化参考；
> 切 PG 后用 `prisma migrate dev` 重新生成 PG 方言迁移。

### 2. 必须配置的环境变量（生产）

| 变量 | 说明 | 启动校验 |
|------|------|---------|
| `AUTH_SECRET` | session 签名密钥，≥32 字符 | ❌ 不配启动失败 |
| `CRON_SECRET` | cron 触发密钥 | ❌ 不配启动失败 |
| `APP_PASSWORD` | 兼容模式单管理员密码（不能是 admin） | ❌ 仍是 admin 启动失败 |
| `DATABASE_URL` | 数据库连接串 | - |
| `SMS_PROVIDER` | mock \| lianlu | - |
| `LIANLU_*` | 短信通道凭证（lianlu 时） | ⚠️ lianlu 时校验 webhook secret |
| `LIANLU_WEBHOOK_SECRET` | 短信回调签名密钥 | ❌ lianlu 时不配启动失败 |
| `PAYMENT_PROVIDER` | mock \| wechat \| alipay | - |

### 3. Docker 部署

```bash
docker build -t vcrm-touch .
docker run -p 3000:3000 --env-file .env vcrm-touch
```

### 4. 健康检查

- `GET /api/health` — 应用存活 + DB 连通性（200=ok / 503=unhealthy）
- `GET /api/health/channel` — 短信通道联调自检 + 回执闭环检查

### 5. 联麓真实通道联调清单

拿到联麓发送 API 文档后逐项配置（参考 `/api/health/channel` 的 checklist）：

1. `LIANLU_SEND_PATH` 发送路径
2. `LIANLU_SUCCESS_FIELD/VALUE` 成功判定字段
3. `LIANLU_MESSAGE_ID_FIELD` 流水号字段（**必须**，否则回执闭环断裂）
4. `LIANLU_DELIVERY_*_FIELD` 回执字段名
5. `LIANLU_WEBHOOK_SECRET` + 在联麓控制台填回调地址 `/api/webhooks/delivery`、`/api/webhooks/mo`
6. 在联麓控制台确认 webhook 签名方式（当前按 HMAC-SHA256 实现，按文档调整）
