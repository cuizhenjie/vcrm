import { db } from "./db";

/**
 * 签名服务：获取当前租户发送时应使用的签名名。
 * 优先级：模板指定 signatureId → 租户默认签名 → 环境变量 LIANLU_SIGN_NAME。
 */
export async function resolveSignName(tenantId: string, signatureId?: string | null): Promise<string> {
  // 1. 模板指定签名（且已审核通过）
  if (signatureId) {
    const sig = await db.smsSignature.findFirst({
      where: { id: signatureId, tenantId, reportStatus: "approved" },
      select: { signName: true },
    });
    if (sig) return normalize(sig.signName);
  }
  // 2. 租户默认签名
  const def = await db.smsSignature.findFirst({
    where: { tenantId, isDefault: true, reportStatus: "approved" },
    select: { signName: true },
  });
  if (def) return normalize(def.signName);
  // 3. 环境变量兜底
  const env = process.env.LIANLU_SIGN_NAME?.trim();
  return env ? normalize(env) : "";
}

/** 规范化签名：确保带【】包裹（联麓 SignName 字段通常不含括号，由通道添加，这里保持原样）。 */
function normalize(name: string): string {
  return name.trim();
}

/** 切换默认签名（同一租户只能有一个默认）。 */
export async function setDefaultSignature(tenantId: string, signatureId: string): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.smsSignature.updateMany({
      where: { tenantId, isDefault: true },
      data: { isDefault: false },
    });
    await tx.smsSignature.updateMany({
      where: { id: signatureId, tenantId },
      data: { isDefault: true },
    });
  });
}
