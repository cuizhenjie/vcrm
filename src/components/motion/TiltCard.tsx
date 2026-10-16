"use client";
import { useRef } from "react";

/**
 * 3D 倾斜卡片：指针跟随的透视倾斜 + 悬浮高度感。
 * - 仅 transform/opacity 合成层动画，无重排
 * - 触屏 / prefers-reduced-motion / 不支持 hover 时退化为普通卡片
 * - 子元素可用 [data-depth] 声明 translateZ 分层（需 preserve-3d 已开启）
 */
export default function TiltCard({
  children,
  className = "",
  style,
  max = 6, // 最大倾斜角度（度）
  scale = 1.015,
}: {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  max?: number;
  scale?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const ok = () =>
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || !ok()) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
      el.style.setProperty("--mx", `${(x * 100 + 50).toFixed(1)}%`);
      el.style.setProperty("--my", `${(y * 100 + 50).toFixed(1)}%`);
    });
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerLeave={leave}
      className={`tilt-card ${className}`}
      style={{ "--tmax": `${max}deg`, "--tscale": scale, ...style } as React.CSSProperties}
    >
      {children}
    </div>
  );
}
