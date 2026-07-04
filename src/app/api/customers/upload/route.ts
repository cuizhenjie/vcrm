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

  // 先在内存里解析出合法客户行（事务内不做解析 IO）
  const parsed: Array<{ name: string | null; mobile: string; vars: string | null }> = [];
  for (const row of rows) {
    const m = pick(row, MOBILE_KEYS);
    if (!m || !/^1\d{10}$/.test(m.val)) continue;
    const n = pick(row, NAME_KEYS);
    const vars: Record<string, string> = {};
    for (const [h, v] of Object.entries(row)) {
      if (h === m.key || (n && h === n.key)) continue;
      vars[h] = String(v);
    }
    parsed.push({
      name: n?.val ?? null,
      mobile: m.val,
      vars: Object.keys(vars).length ? JSON.stringify(vars) : null,
    });
  }

  // 事务：批次创建 + 客户批量写入 + valid 统计，原子完成
  const result = await db.$transaction(async (tx) => {
    const batch = await tx.customerBatch.create({
      data: { tenantId, name: batchName, total: rows.length },
    });
    await tx.customer.createMany({
      data: parsed.map((p) => ({
        tenantId,
        name: p.name,
        mobile: p.mobile,
        batchId: batch.id,
        consentSource: "file_import",
        consentAt: new Date(),
        vars: p.vars,
      })),
    });
    await tx.customerBatch.update({ where: { id: batch.id }, data: { valid: parsed.length } });
    return { batchId: batch.id };
  });

  const columns = Object.keys(rows[0]);
  return NextResponse.json({ batchId: result.batchId, total: rows.length, valid: parsed.length, columns });
}
