# VCRM · 短信触达 MVP（Next.js 轻量全栈）

基于产品 PRD「5G 互动营销触达平台」的 **Phase 1 短信触达** 落地骨架。
零额外基础设施：Next.js 14 App Router + Prisma + SQLite + 通道适配层。
未配联麓凭证也能用 **mock 通道** 跑通「导入 → 检测 → 发送 → 回执 → 短链 → 上行」完整闭环。

## 技术栈
- **Next.js 14（App Router）** — 前端 + API 一体，单进程
- **TypeScript + Tailwind CSS**
- **Prisma + SQLite** — 零配置本地库，可平滑切 PostgreSQL
- **通道适配层** `SmsChannelProvider` — 联麓为其中一种实现，可多通道/切换
- **轻量任务处理器** — 限速分批发送（生产升级 BullMQ + Redis）

## 快速开始
```bash
cp .env.example .env        # 默认 SMS_PROVIDER=mock，开箱即用
npm install
npm run setup               # prisma db push + 种子数据
npm run dev                 # http://localhost:3000
```

## 目录结构
```
src/
  app/                      页面 + API 路由
    api/customers           客户列表 / 导入 / 号码检测
    api/templates           短信模板
    api/campaigns           任务 列表/新建/详情/发送
    api/webhooks/delivery   联麓状态报告回调（靠 extno 回填送达）
    api/webhooks/mo         联麓上行回复回调（关键词→意图标签）
    s/[code]                短链跳转 + 点击追踪
    customers/ templates/ campaigns/   业务页面
  lib/
    sms/                    通道适配层：types / provider / lianlu / mock / index
    db.ts risk.ts shortlink.ts tasks.ts
prisma/schema.prisma        数据模型
```

## 切换到真实联麓通道
1. 控制台核对 `console/document/api_4_2` 的真实 **发送路径 / 参数名 / 签名算法 / 回执字段**
2. 修改 `src/lib/sms/lianlu.ts` 中带 `⚠` 注释处的占位实现
3. `.env` 设 `SMS_PROVIDER=lianlu` 并填 `LIANLU_*` 凭证
4. 把 `/api/webhooks/delivery`、`/api/webhooks/mo` 的公网地址在联麓后台配为回调 URL

## 模拟回调（本地测试回执 / 上行）
```bash
# 送达回执（extno 在任务详情表里）
curl -X POST localhost:3000/api/webhooks/delivery \
  -H 'Content-Type: application/json' \
  -d '{"reports":[{"extno":"<填明细里的流水号>","status":"DELIVRD"}]}'

# 上行回复（命中关键词→写意图标签）
curl -X POST localhost:3000/api/webhooks/mo \
  -H 'Content-Type: application/json' \
  -d '{"mobile":"13800138001","content":"我有兴趣，了解一下"}'
```

## 落地路线
- ✅ **Phase 1（本仓库）**：客户管理 + 短信/彩信触达 + 短链 + 数据看板
- ⏭ **Phase 2**：内容创作引擎（视频编辑器 + 话术编排 + TTS/数字人/合成）
- ⏭ **Phase 3**：5G 视频外呼（需运营商 5G 视频线路 + SP 资质，联麓通道不覆盖）

> ⚠ 合规硬门槛：发送前必须完成 **签名报备 + 模板报备**；营销短信需含退订方式与频控。

## 新增能力（v0.2）

### 定时发送 + 避扰时段
- 新建任务可设 `scheduledAt`，未来时间 → 状态 `scheduled`，到点由调度触发
- 避扰时段（默认 22:00–08:00，`.env` 的 `QUIET_START/END` 可调）内顺延，防投诉封号
- 调度走标准外部 cron：让平台每分钟调用 `GET /api/cron/tick`（可用 `CRON_SECRET` 头校验）
  - 本地测试：`while true; do curl -s localhost:3000/api/cron/tick; sleep 60; done`
  - 生产：Vercel Cron / 系统 crontab / 云函数定时器

### 客户分群圈选
- 新建任务时按「归属地 / 运营商 / 仅历史有意向客户」筛选人群，实时显示匹配人数
- `GET /api/customers/facets` 取可选维度；`POST /api/customers/segment` 预览匹配数

### 联麓通道强化
- `LianluProvider` 端点/签名算法/成功字段全部抽到 `.env`（对接时改配置即可，⚠ 以 api_4_2 文档为准）
- 新增 `queryStatus`（主动查回执，回调兜底）、`balance`（余额）
- 通道自检：`GET /api/health/channel` 返回当前通道、配置完整性、余额

> ⚠ 已知 Next.js 坑：读库/读环境的 GET 路由必须 `export const dynamic = "force-dynamic"`，否则被静态预渲染返回构建时快照。

### A/B 统计显著性（v0.3）
- 自动放量前做**双比例 z 检验**：样本不足（每组 < `AB_MIN_SAMPLE`，默认 30）或差异不显著（置信度 < 95%）时**拦截放量**（HTTP 409），避免把整批名单投给小样本「假赢家」
- 详情页展示置信度与原因；不显著时可人工 `force` 强制放量
- 纯函数实现（`src/lib/significance.ts`），无第三方依赖

## v1.0 — 完整可运行系统 ✅

至此短信触达 MVP 形成端到端闭环，可直接部署运行：

**登录认证**：全站中间件鉴权，登录页 + 会话 Cookie；放行短链/回调/cron 等公开路径（`.env` 的 `APP_PASSWORD`/`AUTH_SECRET`）

**完整功能闭环**
1. 登录 → 工作台概览
2. 客户管理：粘贴/Excel 导入 → 号码检测（剔除空号/黑名单）
3. 短信模板：维护 + 变量 `{name}{link}{自定义列}` + 报备状态
4. 触达任务：分群圈选 + A/B 多变体 + 定时/避扰 + 自动放量(含显著性闸门)
5. 发送：千人千面渲染 + 专属短链 + 限速 + **中途可停止**
6. 回执/上行回调回填 → 转化漏斗 + 意图标签
7. 数据中心：组织级总览 + 14 天趋势 + 活动 CTR 排行
8. **导出**活动明细 CSV（UTF-8 BOM，Excel 直接打开）

**部署**
```bash
cp .env.example .env   # 改 APP_PASSWORD / AUTH_SECRET / 联麓凭证
npm install && npm run setup
npm run build && npm start   # 或 npm run dev
# 定时任务：让 cron 每分钟 curl /api/cron/tick
```

**仅剩对外依赖**：接通真实联麓通道（`LianluProvider` 已配置化，待 api_4_2 文档字段）；其余功能软件侧已完整。
