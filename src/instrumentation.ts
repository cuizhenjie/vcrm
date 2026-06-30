/**
 * Next.js 启动期钩子（Node.js runtime），用于必须在请求前完成的强校验。
 * 文档：https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *
 * 当前用途：
 * 1. 生产环境 AUTH_SECRET 强校验 — 不通过则进程直接退出，防止 dev-secret 跑生产
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getSessionSecret } = await import("./lib/auth");
    try {
      getSessionSecret();
      // eslint-disable-next-line no-console
      console.log("[startup] AUTH_SECRET 校验通过");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  }
}
