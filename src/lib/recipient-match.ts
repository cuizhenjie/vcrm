import { db } from "./db";

/**
 * 回执/上行回调 → Recipient 关联。
 *
 * 设计说明（v2，修复 extno 闭环断裂）：
 * 早期实现用 Recipient.extno（cuid 随机串）做回执/MO 关联键，但 extno 与真实通道侧
 * 没有任何对应关系——真实联麓回执里带回的是「通道流水号 messageId」，而非我们生成的 cuid。
 * 这导致真实通道下所有送达回执、退订、意图回填全部静默失败。
 *
 * 现在的关联优先级（与发送侧落库对齐，见 tasks.ts）：
 *   1. messageId（通道返回的流水号）→ MessageAttempt.providerMessageId → recipientId
 *   2. extno（向后兼容：仍是发送时的 Tag，部分通道回执会原样带回）
 *   3. mobile（兜底：取最近一条该号码的 recipient）
 *
 * 三者都缺失时返回 null，由调用方按 tenantId 兜底处理。
 */
export async function findRecipientByCallback(input: {
  messageId?: string | null;
  extno?: string | null;
  mobile?: string | null;
}) {
  const { messageId, extno, mobile } = input;

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

  // 2. extno（向后兼容：发送时作为 Tag 透传，部分通道回执会带回）
  if (extno) {
    const recipient = await db.recipient.findUnique({ where: { extno } });
    if (recipient) return recipient;
  }

  // 3. mobile 兜底（取最近一条）
  if (mobile) {
    const recipient = await db.recipient.findFirst({
      where: { mobile },
      orderBy: { createdAt: "desc" },
    });
    if (recipient) return recipient;
  }

  return null;
}
