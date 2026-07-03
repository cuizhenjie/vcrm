import { db } from "./db";

/**
 * 回执/上行回调 → Recipient 关联。
 *
 * 设计说明（v3，修复跨租户误关联）：
 * 早期用 Recipient.extno 关联，但 extno 与通道侧无关（闭环断裂）。
 * v2 加了 mobile 兜底，但 mobile 在多租户下不唯一——同一号码可能属于多个租户，
 * 无 tenantId 的 mobile 查询会跨租户误关联（回执/退款/退订写错租户）。
 *
 * 现在的关联优先级（webhook 无 session，无法获取 tenantId，故不用 mobile 兜底）：
 *   1. messageId（通道流水号，全局唯一）→ MessageAttempt.providerMessageId → recipientId
 *   2. extno（发送时作为 Tag 透传，Recipient.extno 有 @unique 约束保证唯一）
 *
 * 两者都缺失时返回 null。mobile 仅在调用方明确知道 tenantId 时由其自行处理，
 * 本函数不做无 tenantId 的 mobile 查询。
 */
export async function findRecipientByCallback(input: {
  messageId?: string | null;
  extno?: string | null;
  mobile?: string | null; // 接收但不再用于无 tenantId 的查询
}) {
  const { messageId, extno } = input;

  // 1. 通道流水号（最可靠：发送成功时已落 MessageAttempt.providerMessageId）
  if (messageId) {
    const attempt = await db.messageAttempt.findFirst({
      where: { providerMessageId: messageId },
      select: { recipientId: true },
    });
    if (attempt) {
      const recipient = await db.recipient.findUnique({ where: { id: attempt.recipientId } });
      if (recipient) return recipient;
    }
  }

  // 2. extno（Recipient.extno 有 @unique 约束，不会跨租户误关联）
  if (extno) {
    const recipient = await db.recipient.findUnique({ where: { extno } });
    if (recipient) return recipient;
  }

  return null;
}
