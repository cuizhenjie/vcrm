"use client";
import { usePathname } from "next/navigation";
import ShaderCanvas from "./ShaderCanvas";

// 独立页（无侧边栏的全屏居中布局）使用深空沉浸式背景
const STANDALONE = ["/login", "/register", "/pay/mock"];

/**
 * 全站共享着色器背景层（单 WebGL 实例，随路由自适应变体）。
 * - silk：应用内页浅色流光；nebula：登录/注册/支付深空沉浸式
 * - fixed 铺满视口、置于内容之下；WebGL 不可用时展示同色系 CSS 渐变兜底
 */
export default function ShaderBackground() {
  const path = usePathname() ?? "/";
  const variant = STANDALONE.some((p) => path.startsWith(p)) ? "nebula" : "silk";
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* CSS 渐变兜底 + 首屏打底（shader 首帧就绪前即有正确底色） */}
      <div
        key={variant}
        className={
          variant === "nebula"
            ? "absolute inset-0 bg-[radial-gradient(120%_90%_at_20%_0%,#232a55_0%,#181d34_45%,#12162a_100%)]"
            : "absolute inset-0 bg-[linear-gradient(160deg,#f6f7fc_0%,#eef1fa_50%,#f4f2fa_100%)]"
        }
      />
      <ShaderCanvas key={variant} variant={variant} className="absolute inset-0 h-full w-full" />
    </div>
  );
}
