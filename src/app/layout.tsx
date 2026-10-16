import "./globals.css";
import type { Metadata } from "next";
import Sidebar from "@/components/Sidebar";
import ShaderBackground from "@/components/shaders/ShaderBackground";

export const metadata: Metadata = { title: "VCRM · 短信触达", description: "5G 互动营销触达平台 — 短信触达 MVP" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        {/* 全站共享单实例 WebGL 流光背景（随路由自适应变体，WebGL 不可用时 CSS 渐变兜底） */}
        <ShaderBackground />
        <div className="flex">
          <Sidebar />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </body>
    </html>
  );
}
