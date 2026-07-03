import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { db } from "@/lib/db";
import { currentTenantId } from "@/lib/tenant";

// 识别表头中的手机号/姓名列；其余列作为千人千面变量
const MOBILE_KEYS = ["手机号", "手机", "电话", "号码", "mobile", "phone"];
const NAME_KEYS = ["姓名", "名称", "客户", "name"];
const pick = (row: Record<string, any>, keys: string[]) => {
  const k = Object.keys(row).find((h) => keys.some((kk) => h.toLowerCase().includes(kk.toLowerCase())));
  return k ? { key: k, val: String(row[k]).trim() } : null;
};

/** 解析上传的 Excel/CSV 为行数组（首行作为表头）。 */
async function parseRows(file: File): Promise<Record<string, any>[]> {
  const buf = Buffer.from(await file.arrayBuffer());
  const wb = new ExcelJS.Workbook();
  // CSV 用 csv.read，其余用 load（exceljs 的 .xlsx 读取入口）
  const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
  if (isCsv) {
    // exceljs CSV 读取需要一个可读流；Node 下用 stream.Readable 包装 Buffer
    const { Readable } = await import("node:stream");
    await wb.csv.read(Readable.from(buf));
  } else {
    // 类型断言绕过 @types/node 版本间 Buffer 泛型差异(exceljs 依赖较旧类型)
    await wb.xlsx.load(buf as any);
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Record<string, any>[] = [];
  let headers: string[] = [];
  ws.eachRow((row, rowIdx) => {
    const values = (row.values as any[]).slice(1); // values[0] 恒为 undefined
    if (rowIdx === 1) {
      headers = values.map((v) => (v == null ? "" : String(v)).trim());
      return;
    }
    const obj: Record<string, any> = {};
    values.forEach((v, i) => {
      const h = headers[i];
      if (h) obj[h] = v == null ? "" : String(v);
    });
    rows.push(obj);
  });
  return rows;
}

export async function POST(req: NextRequest) {
  const tenantId = currentTenantId();
  const form = await req.formData();
  const file = form.get("file") as File | null;
  const batchName = (form.get("batchName") as string) || "Excel 导入";
  if (!file) return NextResponse.json({ error: "未收到文件" }, { status: 400 });

  const rows = await parseRows(file);
  if (rows.length === 0) return NextResponse.json({ error: "表格为空或无表头" }, { status: 400 });

  const batch = await db.customerBatch.create({ data: { tenantId, name: batchName, total: rows.length } });
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
      data: { tenantId, name: n?.val ?? null, mobile: m.val, batchId: batch.id,
              consentSource: "file_import", consentAt: new Date(),
              vars: Object.keys(vars).length ? JSON.stringify(vars) : null },
    });
    valid++;
  }
  await db.customerBatch.update({ where: { id: batch.id }, data: { valid } });
  const columns = Object.keys(rows[0]);
  return NextResponse.json({ batchId: batch.id, total: rows.length, valid, columns });
}
