import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";

// 识别表头中的手机号/姓名列；其余列作为千人千面变量
const MOBILE_KEYS = ["手机号", "手机", "电话", "号码", "mobile", "phone"];
const NAME_KEYS = ["姓名", "名称", "客户", "name"];
const pick = (row: Record<string, any>, keys: string[]) => {
  const k = Object.keys(row).find((h) => keys.some((kk) => h.toLowerCase().includes(kk.toLowerCase())));
  return k ? { key: k, val: String(row[k]).trim() } : null;
};

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const batchName = (form.get("batchName") as string) || "Excel 导入";
  if (!file) return NextResponse.json({ error: "未收到文件" }, { status: 400 });

  const wb = XLSX.read(Buffer.from(await file.arrayBuffer()));
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
  if (rows.length === 0) return NextResponse.json({ error: "表格为空或无表头" }, { status: 400 });

  const batch = await db.customerBatch.create({ data: { name: batchName, total: rows.length } });
  let valid = 0;
  for (const row of rows) {
    const m = pick(row, MOBILE_KEYS);
    if (!m || !/^1\d{10}$/.test(m.val)) continue;
    const n = pick(row, NAME_KEYS);
    // 其余列 → 变量 JSON
    const vars: Record<string, string> = {};
    for (const [h, v] of Object.entries(row)) {
      if (h === m.key || (n && h === n.key)) continue;
      vars[h] = String(v);
    }
    await db.customer.create({
      data: { name: n?.val ?? null, mobile: m.val, batchId: batch.id,
              vars: Object.keys(vars).length ? JSON.stringify(vars) : null },
    });
    valid++;
  }
  await db.customerBatch.update({ where: { id: batch.id }, data: { valid } });
  const columns = Object.keys(rows[0]);
  return NextResponse.json({ batchId: batch.id, total: rows.length, valid, columns });
}
