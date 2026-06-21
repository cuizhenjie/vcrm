// 模板变量替换：{name}、{link}、以及名单里的自定义列 {xxx}
export function render(tpl: string, vars: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}
export function parseVars(json?: string | null): Record<string, string> {
  if (!json) return {};
  try { return JSON.parse(json); } catch { return {}; }
}
