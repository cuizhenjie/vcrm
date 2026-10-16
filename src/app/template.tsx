export default function Template({ children }: { children: React.ReactNode }) {
  // 每次路由导航重挂载 → 触发 CSS 入场动效，形成轻量页面转场
  return <div className="page-enter">{children}</div>;
}
