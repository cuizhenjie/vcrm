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
