// 通道适配层统一类型——业务只依赖这些，不依赖具体厂商字段
export interface TextSmsReq { mobile: string; content: string; extno?: string; }
export interface MmsReq { mobile: string; templateId: string; extno?: string; }
export interface FlashReq { mobile: string; content: string; extno?: string; }

export interface SendResult { ok: boolean; messageId?: string; code?: string; raw?: unknown; }
export interface CheckResult { mobile: string; status: "active" | "empty" | "unknown"; province?: string; carrier?: string; }
export interface DeliveryReport { extno: string; status: "delivered" | "undelivered" | "unknown"; }

export interface SmsChannelProvider {
  name: string;
  sendText(req: TextSmsReq): Promise<SendResult>;
  sendMms(req: MmsReq): Promise<SendResult>;
  sendFlash(req: FlashReq): Promise<SendResult>;
  checkNumbers(mobiles: string[]): Promise<CheckResult[]>;
}
