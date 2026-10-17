"use client";
import Link from "next/link";
import ShaderCanvas from "@/components/shaders/ShaderCanvas";
import TiltCard from "@/components/motion/TiltCard";
import CountUp from "@/components/motion/CountUp";

/**
 * 产品宣传落地页 —— 以 aurora 极光 shader 为视觉核心的公开页面（无需登录）。
 * 结构：全屏极光 hero → 特性矩阵（浅色 silk 流光透出）→ 深色数据带 → 四步流程 → 极光 CTA → 页脚。
 */

const FEATURES = [
  { icon: "📇", title: "客户管理", desc: "Excel/CSV 一键导入，自动识别列，千人千面变量直达每条短信。" },
  { icon: "🔍", title: "空号检测", desc: "发送前剔除空号/停机/黑名单，按批次检测空号率，省下每一分钱。" },
  { icon: "🚀", title: "合规触达", desc: "签名与模板通道报备、定时发送、避扰时段顺延，限速批量执行。" },
  { icon: "🧪", title: "A/B 测试", desc: "多文案按权重分流，双比例 z 检验判定显著，赢家自动放量。" },
  { icon: "📊", title: "转化归因", desc: "发送→送达→点击→回复→成交全链路漏斗，活动 ROI 一目了然。" },
  { icon: "🎬", title: "AI 视频生成", desc: "火山方舟 Seedance 文案直达营销视频，视频短信让 5G 消息生动起来。" },
];

const METRICS = [
  { v: 5, unit: " 分钟", label: "从导入客户到发出第一条短信" },
  { v: 6, unit: " 大模块", label: "触达/检测/线索/分析开箱即用" },
  { v: 3, unit: " 条通道", label: "Mock/联麓/火山引擎灵活切换" },
  { v: 24, unit: "h", label: "AI 视频生成出片时效" },
];

const STEPS = [
  { n: "01", title: "导入客户", desc: "粘贴或上传名单，变量自动就位" },
  { n: "02", title: "检测清洗", desc: "空号/黑名单一键过滤" },
  { n: "03", title: "创建触达", desc: "选模板、圈人群、A/B 分流" },
  { n: "04", title: "转化跟进", desc: "点击回复自动生成线索池" },
];

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-x-clip">
      {/* ===== Hero：全屏极光 ===== */}
      <section className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4">
        <div className="absolute inset-0 bg-[radial-gradient(130%_100%_at_50%_0%,#141c44_0%,#0c1129_55%,#070a1c_100%)]" />
        <ShaderCanvas variant="aurora" speed={1.25} className="absolute inset-0 h-full w-full" />

        {/* 顶部导航 */}
        <header className="absolute top-0 inset-x-0 z-10 flex items-center justify-between px-5 md:px-10 h-16">
          <div className="text-xl font-bold text-white tracking-wide"><span className="text-primary">V</span>CRM</div>
          <nav className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-white/80 hover:text-white transition-colors px-3 py-1.5">登录</Link>
            <Link href="/register" className="btn btn-pri">免费注册</Link>
          </nav>
        </header>

        {/* 主文案 */}
        <div className="relative z-10 text-center max-w-3xl mx-auto pt-16">
          <div className="reveal-scale inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 backdrop-blur px-4 py-1.5 text-xs text-white/80 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-300 animate-pulse" />
            5G 消息 · 互动营销 · 一站式闭环
          </div>
          <h1 className="reveal text-4xl sm:text-5xl md:text-6xl font-bold text-white leading-tight tracking-tight" style={{ "--d": "80ms" } as React.CSSProperties}>
            让每一条短信
            <br />
            <span className="bg-gradient-to-r from-cyan-300 via-indigo-300 to-fuchsia-400 bg-clip-text text-transparent">
              都成为转化入口
            </span>
          </h1>
          <p className="reveal text-base md:text-lg text-white/70 mt-6 leading-relaxed" style={{ "--d": "160ms" } as React.CSSProperties}>
            客户导入 · 空号检测 · A/B 文案 · 转化漏斗 · AI 视频生成
            <br className="hidden md:block" />
            从触达到成交，全链路数据驱动的营销触达平台。
          </p>
          <div className="reveal flex flex-col sm:flex-row items-center justify-center gap-4 mt-10" style={{ "--d": "240ms" } as React.CSSProperties}>
            <Link href="/register" className="btn btn-pri !h-11 !px-8 text-base w-full sm:w-auto justify-center">
              免费开始使用 →
            </Link>
            <Link href="/login" className="btn !h-11 !px-8 text-base w-full sm:w-auto justify-center !bg-white/10 !border-white/20 !text-white hover:!border-white/40 backdrop-blur">
              已有账号登录
            </Link>
          </div>
          <div className="reveal text-xs text-white/45 mt-6" style={{ "--d": "320ms" } as React.CSSProperties}>
            无需信用卡 · 5 分钟上手 · 数据本地可控
          </div>
        </div>

        {/* 底部滚动提示 */}
        <div className="absolute bottom-7 left-1/2 -translate-x-1/2 text-white/40 text-xs flex flex-col items-center gap-1.5 animate-bounce">
          <span>了解全部能力</span>
          <span className="block w-px h-8 bg-gradient-to-b from-white/40 to-transparent" />
        </div>
      </section>

      {/* ===== 特性矩阵（浅色区，全局 silk 流光透出） ===== */}
      <section className="relative py-20 md:py-28 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="reveal text-xs font-medium text-primary tracking-widest mb-3">CAPABILITIES</div>
            <h2 className="reveal text-3xl md:text-4xl font-bold text-ink" style={{ "--d": "60ms" } as React.CSSProperties}>
              一个平台，跑完营销触达全流程
            </h2>
            <p className="reveal text-ink2 mt-3 max-w-xl mx-auto" style={{ "--d": "120ms" } as React.CSSProperties}>
              从客户资产到转化线索，每个环节都有数据看板与自动化策略兜底。
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <TiltCard key={f.title} className="reveal" style={{ "--d": `${i * 70}ms` } as React.CSSProperties}>
                <div className="card card-interactive p-6 h-full">
                  <div className="text-3xl mb-4" data-depth>{f.icon}</div>
                  <div className="font-semibold text-ink mb-2">{f.title}</div>
                  <p className="text-sm text-ink2 leading-relaxed">{f.desc}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 数据带（深色玻璃） ===== */}
      <section className="px-4 pb-20 md:pb-28">
        <div className="reveal-scale max-w-6xl mx-auto rounded-2xl border border-white/10 bg-ink/90 backdrop-blur px-6 md:px-12 py-12 md:py-16 relative overflow-hidden">
          <div className="absolute -top-24 left-1/4 w-96 h-48 rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute -bottom-24 right-1/4 w-96 h-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative grid grid-cols-2 md:grid-cols-4 gap-8 md:gap-6 text-center">
            {METRICS.map((m, i) => (
              <div key={m.label} className="reveal" style={{ "--d": `${i * 90}ms` } as React.CSSProperties}>
                <div className="text-4xl md:text-5xl font-bold leading-none bg-gradient-to-r from-cyan-300 to-indigo-300 bg-clip-text text-transparent tabular-nums">
                  <CountUp to={m.v} duration={1400} />
                  <span className="text-xl md:text-2xl">{m.unit}</span>
                </div>
                <div className="text-xs md:text-sm text-white/55 mt-3">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== 四步流程 ===== */}
      <section className="py-20 md:py-24 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <div className="reveal text-xs font-medium text-primary tracking-widest mb-3">WORKFLOW</div>
            <h2 className="reveal text-3xl md:text-4xl font-bold text-ink" style={{ "--d": "60ms" } as React.CSSProperties}>四步开启你的第一次触达</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {STEPS.map((s, i) => (
              <div key={s.n} className="reveal relative card p-6" style={{ "--d": `${i * 90}ms` } as React.CSSProperties}>
                <div className="text-5xl font-bold text-primary/10 absolute top-4 right-5 leading-none select-none">{s.n}</div>
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary font-bold flex items-center justify-center mb-4">{i + 1}</div>
                <div className="font-semibold text-ink mb-1.5">{s.title}</div>
                <p className="text-sm text-ink2">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA：极光回归 ===== */}
      <section className="relative px-4 pb-24">
        <div className="reveal-scale relative max-w-6xl mx-auto rounded-3xl overflow-hidden min-h-[380px] flex items-center justify-center">
          <div className="absolute inset-0 bg-[radial-gradient(120%_120%_at_50%_120%,#182052_0%,#0b1029_60%,#070a1c_100%)]" />
          <ShaderCanvas variant="aurora" speed={1.1} className="absolute inset-0 h-full w-full" />
          <div className="relative z-10 text-center px-6 py-16">
            <h2 className="text-3xl md:text-4xl font-bold text-white">现在开始，让触达自带转化</h2>
            <p className="text-white/65 mt-4 max-w-md mx-auto">注册即送免费额度，5 分钟跑通你的第一条营销短信。</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-9">
              <Link href="/register" className="btn btn-pri !h-11 !px-9 text-base w-full sm:w-auto justify-center">免费注册</Link>
              <Link href="/pricing" className="btn !h-11 !px-9 text-base w-full sm:w-auto justify-center !bg-white/10 !border-white/20 !text-white hover:!border-white/40 backdrop-blur">查看定价</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 页脚 ===== */}
      <footer className="border-t border-line py-8 px-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-ink3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-ink text-base"><span className="text-primary">V</span>CRM</span>
            <span>· 5G 互动营销触达平台</span>
          </div>
          <div>© 2026 VCRM · 短信触达 MVP · 沪ICP备占位</div>
        </div>
      </footer>
    </main>
  );
}
