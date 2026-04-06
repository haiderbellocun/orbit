import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { pool } from "./connection";

const XLSX_PATH = path.resolve("C:/app_orbit/Docentes 2026A con datos.xlsx");

type Row = unknown[];

function cell(row: Row, idx: number): unknown {
  return idx < row.length ? row[idx] : undefined;
}

function toDoc(val: unknown): string | null {
  if (val == null || val === undefined) return null;
  if (typeof val === "string" && val.trim().startsWith("=")) return null;
  if (val === "") return null;
  const n = Number(val);
  if (!Number.isNaN(n)) return Math.round(n).toString();
  const s = String(val).trim();
  return s === "" ? null : s;
}

function strLiteName(val: unknown): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "string" && val.trim().startsWith("=")) return null;
  const s = String(val).trim();
  if (s === "") return null;
  return s.length > 150 ? s.slice(0, 150) : s;
}

function loadRows(): Row[] {
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true, raw: false });
  const sh = wb.Sheets["Carga Actual"];
  if (!sh) {
    throw new Error('No se encontró la hoja "Carga Actual" en el libro.');
  }
  return XLSX.utils.sheet_to_json<Row>(sh, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as Row[];
}

async function main(): Promise<void> {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`No existe el archivo: ${XLSX_PATH}`);
  }

  const rows = loadRows();
  let updated = 0;

  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    const document = toDoc(cell(row, 1));
    if (document == null) continue;

    const lite_name = strLiteName(cell(row, 19));
    if (lite_name == null) continue;

    const lite_document = toDoc(cell(row, 20));

    const result = await pool.query(
      `UPDATE teachers
       SET lite_name = $1, lite_document = $2
       WHERE document = $3`,
      [lite_name, lite_document, document]
    );
    updated += result.rowCount ?? 0;
  }

  console.log(`✓ Docentes actualizados con LITE: ${updated}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
