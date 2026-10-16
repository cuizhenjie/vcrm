import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * 公开配置（无敏感信息）：供前端展示真实的服务端配置。
 * 当前仅暴露避扰时段（QUIET_START/QUIET_END），避免客户端读不到 env 而展示硬编码默认值。
 * 如需新增公开配置项，在此追加即可（切勿放密钥/敏感值）。
 */
export async function GET() {
  const start = process.env.QUIET_START ?? "22";
  const end = process.env.QUIET_END ?? "8";
  const pad = (n: string) => n.padStart(2, "0");
  const label = `${pad(start)}:00–${pad(end)}:00`;
  return NextResponse.json({
    quietHours: {
      start,
      end,
      label,
      enabled: Number(start) !== 0 || Number(end) !== 0,
    },
    smsProvider: process.env.SMS_PROVIDER ?? "mock",
  });
}
