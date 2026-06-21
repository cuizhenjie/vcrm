import type { SmsChannelProvider } from "./types";
import { MockProvider } from "./mock";
import { LianluProvider } from "./lianlu";

// 工厂：按环境变量切换通道。未来加新通道在此注册即可。
export function getProvider(): SmsChannelProvider {
  return process.env.SMS_PROVIDER === "lianlu" ? LianluProvider : MockProvider;
}
export * from "./types";
