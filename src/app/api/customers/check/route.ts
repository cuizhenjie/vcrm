import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/sms";
import { currentTenantId } from "@/lib/tenant";
import { validate, customerCheckSchema } from "@/lib/schemas";

// body = { batchId } —— 对批次内（或全部 pending）号码做空号检测
export async function POST(req: NextRequest) {
  const tenantId = currentTenantId();
  const body = await req.json().catch(() => ({}));
  const checked = validate(customerCheckSchema, body);
  const batchId = checked.success ? checked.data.batchId : undefined;

  const customers = await db.customer.findMany({
    where: batchId ? { tenantId, batchId } : { tenantId, checkStatus: "pending" },
    select: { id: true, mobile: true, isBlacklist: true, province: true, carrier: true },
  });
  if (customers.length === 0) return NextResponse.json({ checked: 0 });

  // 置 checking 中间态（前端可轮询进度）
  await db.customer.updateMany({
    where: { id: { in: customers.map((c) => c.id) } },
    data: { checkStatus: "checking" },
  });
  if (batchId) {
    await db.customerBatch.updateMany({ where: { tenantId, id: batchId }, data: { checkStatus: "checking" } });
  }

  const results = await getProvider().checkNumbers(customers.map((c) => c.mobile));

  // 分块提交事务（每块 500 条）：避免单个长事务在 SQLite 库级写锁下长时间阻塞全系统写
  const CHUNK = 500;
  let valid = 0;
  try {
    for (let i = 0; i < customers.length; i += CHUNK) {
      const chunk = customers.slice(i, i + CHUNK);
      await db.$transaction(async (tx) => {
        for (const c of chunk) {
          const r = results.find((x) => x.mobile === c.mobile);
          const empty = r?.status === "empty";
          if (!empty && !c.isBlacklist) valid++;
          await tx.customer.update({
            where: { id: c.id },
            data: {
              checkStatus: "done",
              province: r?.province ?? c.province,
              carrier: r?.carrier ?? c.carrier,
              isBlacklist: empty ? true : c.isBlacklist,
            },
          });
        }
      }, { timeout: 30000, maxWait: 30000 });
    }
    if (batchId) {
      await db.customerBatch.updateMany({
        where: { tenantId, id: batchId },
        data: { checkStatus: "done", valid },
      });
    }
  } catch (e) {
    console.error("[customers/check] failed", e);
    // 回滚 checking → pending：防止客户/批次永久卡在 checking 导致前端无限轮询
    await db.customer.updateMany({
      where: { id: { in: customers.map((c) => c.id) }, checkStatus: "checking" },
      data: { checkStatus: "pending" },
    }).catch(() => {});
    if (batchId) {
      await db.customerBatch.updateMany({
        where: { tenantId, id: batchId, checkStatus: "checking" },
        data: { checkStatus: "pending" },
      }).catch(() => {});
    }
    return NextResponse.json({ error: "号码检测失败，已回滚待重试" }, { status: 500 });
  }
  return NextResponse.json({ checked: customers.length, valid });
}
