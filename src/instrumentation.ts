/**
 * Next.js 启动期钩子（Node.js runtime），用于必须在请求前完成的强校验。
 * 文档：https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * 当前用途：
 * 1. 生产环境 AUTH_SECRET 强校验 — 不通过则进程直接退出，防止 dev-secret 跑生产
 * 2. 生产环境 CRON_SECRET / APP_PASSWORD 强校验 — 防止公开 cron 与默认口令
 * 3. 生产环境接入真实短信通道(SMS_PROVIDER=lianlu)时强制 LIANLU_WEBHOOK_SECRET 配置
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getSessionSecret } = await import("./lib/auth");
    try {
      getSessionSecret();
      if (process.env.NODE_ENV === "production") {
        if (!process.env.CRON_SECRET) throw new Error("[FATAL] CRON_SECRET 未设置，生产环境禁止公开 cron");
        if (!process.env.APP_PASSWORD || process.env.APP_PASSWORD === "admin") {
          throw new Error("[FATAL] APP_PASSWORD 未设置或仍为 admin，生产环境禁止默认口令");
        }
        // 接入真实短信通道时，回调签名密钥必须配置（防止 webhook 被伪造触发退款/退订）
        if (process.env.SMS_PROVIDER === "lianlu" && !process.env.LIANLU_WEBHOOK_SECRET) {
          throw new Error("[FATAL] SMS_PROVIDER=lianlu 但 LIANLU_WEBHOOK_SECRET 未设置，生产环境禁止裸奔回调");
        }
      }
      // eslint-disable-next-line no-console
      console.log("[startup] AUTH_SECRET 校验通过");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }
}
