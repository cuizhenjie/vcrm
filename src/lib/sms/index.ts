import type { SmsChannelProvider } from "./types";
import { MockProvider } from "./mock";
import { LianluProvider } from "./lianlu";
import { VolcengineProvider } from "./volcengine";

// 工厂：按环境变量切换通道。未来加新通道在此注册即可。
export function getProvider(): SmsChannelProvider {
  const name = process.env.SMS_PROVIDER ?? "mock";
  if (name === "lianlu") return LianluProvider;
  if (name === "volcengine") return VolcengineProvider;
  return MockProvider;
}
export * from "./types";
