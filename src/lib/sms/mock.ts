import type { SmsChannelProvider, TextSmsReq, MmsReq, FlashReq, CheckResult } from "./types";
// 本地开发用：无需真实凭证，模拟发送与号码检测
const carriers = ["移动", "联通", "电信"];
const provinces = ["上海", "北京", "广州", "杭州", "深圳", "成都"];
const rnd = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export const MockProvider: SmsChannelProvider = {
  name: "mock",
  async sendText(_req: TextSmsReq) { await wait(); return ok(); },
  async sendMms(_req: MmsReq) { await wait(); return ok(); },
  async sendFlash(_req: FlashReq) { await wait(); return ok(); },
  async checkNumbers(mobiles: string[]): Promise<CheckResult[]> {
    return mobiles.map((mobile) => ({
      mobile,
      status: Math.random() < 0.1 ? "empty" : "active",
      province: rnd(provinces),
      carrier: rnd(carriers),
    }));
  },
  async queryStatus(extnos: string[]) {
    return extnos.map((extno) => ({ extno, status: "delivered" as const }));
  },
  async balance() { return { ok: true, balance: 99999 }; },
};
const wait = () => new Promise((r) => setTimeout(r, 30));
const ok = () => ({ ok: Math.random() > 0.03, messageId: "mock_" + Math.random().toString(36).slice(2) });
