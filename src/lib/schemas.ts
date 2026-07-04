import { z } from "zod";

/**
 * 共享的 zod 校验 schema，给关键写路径复用。
 * 校验失败由各路由自行返回 400（统一错误格式）。
 */

export const mobileSchema = z.string().regex(/^1\d{10}$/, "手机号格式不正确");

export const loginSchema = z.object({
  email: z.string().email("邮箱格式不正确").max(200),
  password: z.string().min(1).max(200),
});

export const registerSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/, "租户标识需为 3-32 位小写字母数字连字符"),
  tenantName: z.string().trim().max(100).optional(),
  email: z.string().email("邮箱格式不正确").max(200),
  userName: z.string().trim().max(100).optional(),
  password: z.string().min(8, "密码至少 8 位").max(128),
});

export const rechargeSchema = z.object({
  quantity: z.number().int().min(1, "充值数量需为正整数").max(1_000_000, "单次充值上限 100 万条"),
  provider: z.string().trim().max(50).optional(),
});

export const customerCheckSchema = z.object({
  batchId: z.string().max(100).optional(),
});

export const campaignCreateSchema = z.object({
  name: z.string().trim().min(1, "任务名称必填").max(100),
  type: z.enum(["text_sms", "video_sms", "flash"]).optional(),
  templateId: z.string().max(100).optional(),
  batchId: z.string().max(100).optional(),
  variants: z
    .array(
      z.object({
        label: z.string().max(50).optional(),
        templateId: z.string().max(100).optional(),
        weight: z.number().int().min(1).max(100).optional(),
      }),
    )
    .max(10)
    .optional(),
  autoRollout: z.boolean().optional(),
  testRatio: z.number().min(1).max(100).optional(),
  segment: z
    .object({
      provinces: z.array(z.string().max(20)).max(50).optional(),
      carriers: z.array(z.string().max(20)).max(20).optional(),
      videoCapable: z.string().max(10).optional(),
    })
    .passthrough()
    .optional(),
  scheduledAt: z.string().max(50).optional(),
  quietHours: z.boolean().optional(),
  source: z
    .object({
      fromCampaignId: z.string().max(100).optional(),
      audience: z.string().max(50).optional(),
    })
    .passthrough()
    .optional(),
});

/** 解析+校验，返回 { success, data?, error? }，便于路由统一处理。 */
export function validate<T>(schema: z.ZodSchema<T>, input: unknown):
  | { success: true; data: T }
  | { success: false; error: string } {
  const result = schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  const first = result.error.issues[0];
  return { success: false, error: first?.message ?? "参数校验失败" };
}
