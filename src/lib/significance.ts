// A/B 统计显著性：双比例 z 检验（CTR 对比），纯函数无第三方依赖
export type VariantScore = { id: string; label: string; sent: number; visited: number };
export type SignificanceResult = {
  winner: VariantScore | null;
  runnerUp: VariantScore | null;
  z: number;
  pValue: number;
  confidence: number;   // 百分比
  significant: boolean;  // 是否可放心放量
  enoughSample: boolean;
  minSample: number;
  reason: string;
};

// 标准正态 CDF（Abramowitz & Stegun 7.1.26 近似）
function normalCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function abSignificance(scores: VariantScore[]): SignificanceResult {
  const minSample = Number(process.env.AB_MIN_SAMPLE ?? 30);
  const valid = scores.filter((s) => s.sent > 0).sort((a, b) => b.visited / b.sent - a.visited / a.sent);
  const winner = valid[0] ?? null;
  const runnerUp = valid[1] ?? null;
  const base = { winner, runnerUp, z: 0, pValue: 1, confidence: 0, minSample };

  if (!winner) return { ...base, significant: false, enoughSample: false, reason: "暂无测试数据" };
  if (!runnerUp) return { ...base, confidence: 100, significant: winner.sent >= minSample, enoughSample: winner.sent >= minSample,
    reason: winner.sent >= minSample ? "仅一个有效变体" : "样本量不足" };

  const enoughSample = winner.sent >= minSample && runnerUp.sent >= minSample;
  const p1 = winner.visited / winner.sent;
  const p2 = runnerUp.visited / runnerUp.sent;
  const pPool = (winner.visited + runnerUp.visited) / (winner.sent + runnerUp.sent);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / winner.sent + 1 / runnerUp.sent));
  const z = se === 0 ? 0 : (p1 - p2) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  const confidence = Math.round((1 - pValue) * 100);
  const significant = enoughSample && pValue < 0.05;

  const reason = !enoughSample
    ? `样本量不足（需每组≥${minSample}，当前 ${winner.sent}/${runnerUp.sent}）`
    : significant ? `差异显著，置信度 ${confidence}%` : `差异不显著（置信度 ${confidence}% < 95%），建议继续观察`;
  return { winner, runnerUp, z, pValue, confidence, significant, enoughSample, minSample, reason };
}
