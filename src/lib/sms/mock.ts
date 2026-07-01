import type { SmsChannelProvider, TextSmsReq, MmsReq, FlashReq, CheckResult } from "./types";
// 本地开发用：无需真实凭证，模拟发送与号码检测
const carriers = ["移动", "联通", "电信"];
const provinces = ["上海", "北京", "广州", "杭州", "深圳", "成都"];

const rate = (key: string): number => {
  const n = Number(process.env[key] ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.min(1, n) : 0;
};

const hash = (s: string): number => [...s].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
const pickStable = <T>(items: T[], key: string): T => items[hash(key) % items.length];
const maybeFail = (key: string, threshold: number): boolean => ((hash(key) % 1000) / 1000) < threshold;

export const MockProvider: SmsChannelProvider = {
  name: "mock",
  async sendText(_req: TextSmsReq) { await wait(); return ok(); },
  async sendMms(_req: MmsReq) { await wait(); return ok(); },
  async sendFlash(_req: FlashReq) { await wait(); return ok(); },
  async checkNumbers(mobiles: string[]): Promise<CheckResult[]> {
    const emptyRate = rate("MOCK_EMPTY_RATE");
    return mobiles.map((mobile) => ({
      mobile,
      status: maybeFail(mobile, emptyRate) ? "empty" : "active",
      province: pickStable(provinces, mobile),
      carrier: pickStable(carriers, mobile),
    }));
  },
  async queryStatus(extnos: string[]) {
    return extnos.map((extno) => ({ extno, status: "delivered" as const }));
  },
  async balance() { return { ok: true, balance: 99999 }; },
};
const wait = () => new Promise((r) => setTimeout(r, 30));
const ok = () => {
  const seed = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return { ok: !maybeFail(seed, rate("MOCK_SEND_FAILURE_RATE")), messageId: "mock_" + hash(seed).toString(36) };
};
