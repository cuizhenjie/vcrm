/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 启用启动期钩子（启动时执行 src/instrumentation.ts，强制校验生产环境 AUTH_SECRET）
  experimental: { instrumentationHook: true },
};
export default nextConfig;
