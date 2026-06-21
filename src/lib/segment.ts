import type { Prisma } from "@prisma/client";

export type Segment = {
  batchId?: string;
  provinces?: string[];
  carriers?: string[];
  onlyIntent?: boolean; // 仅历史「有意向」客户（高价值复投）
};

export function buildSegmentWhere(seg?: Segment): Prisma.CustomerWhereInput {
  const where: Prisma.CustomerWhereInput = { isBlacklist: false };
  if (seg?.batchId) where.batchId = seg.batchId;
  if (seg?.provinces?.length) where.province = { in: seg.provinces };
  if (seg?.carriers?.length) where.carrier = { in: seg.carriers };
  if (seg?.onlyIntent) where.recipients = { some: { intentTag: "有意向" } };
  return where;
}
