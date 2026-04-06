import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { pool } from "./connection";

const XLSX_PATH = path.resolve("C:/app_orbit/Docentes 2026A con datos.xlsx");
const SHEET_NAME = "Proyección Docentes 2026B";
const PERIOD_FIXED = "2026B";

type Row = unknown[];

function cell(row: Row, idx: number): unknown {
  return idx < row.length ? row[idx] : undefined;
}

function strOrNull(val: unknown, maxLen?: number): string | null {
  if (val == null || val === "") return null;
  let s = String(val).trim();
  if (s === "") return null;
  if (maxLen != null && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function toDocumentString(val: unknown): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "string" && val.trim().startsWith("=")) return null;
  const n = Number(val);
  if (!Number.isNaN(n)) return Math.round(n).toString();
  const s = String(val).trim();
  return s === "" ? null : s;
}

function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;
  const ms = (serial - 25569) * 86400 * 1000;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  if (y < 1950 || y > 2100) return null;
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toDateString(val: unknown): string | null {
  if (val == null || val === "") return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, "0");
    const d = String(val.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof val === "number") {
    const iso = excelSerialToIso(val);
    if (iso != null) return iso;
  }
  if (typeof val === "string") {
    const t = Date.parse(val);
    if (!Number.isNaN(t)) {
      const dt = new Date(t);
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
      const d = String(dt.getUTCDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function toInt(val: unknown, fallback: number): number {
  if (val == null || val === "") return fallback;
  const n = Number.parseInt(String(val).replace(/\s/g, ""), 10);
  return Number.isNaN(n) ? fallback : n;
}

function sheetRows(name: string): Row[] {
  const wb = XLSX.readFile(XLSX_PATH, { cellDates: true, raw: false });
  const sh = wb.Sheets[name];
  if (!sh) {
    throw new Error(`No se encontró la hoja "${name}" en el libro.`);
  }
  return XLSX.utils.sheet_to_json<Row>(sh, {
    header: 1,
    defval: null,
    blankrows: false,
  }) as Row[];
}

async function loadCoordinatorMap(): Promise<Map<string, number>> {
  const res = await pool.query<{ id: number; document: string }>(
    "SELECT id, document FROM coordinators"
  );
  const m = new Map<string, number>();
  for (const r of res.rows) {
    m.set(r.document, r.id);
  }
  return m;
}

async function seedProjection2026B(): Promise<number> {
  const rows = sheetRows(SHEET_NAME);
  const coordinatorMap = await loadCoordinatorMap();
  let inserted = 0;

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const program = strOrNull(cell(row, 2), 150);
    if (program == null) continue;

    const origin = strOrNull(cell(row, 1), 50);
    const school = strOrNull(cell(row, 3), 150);
    const start_date = toDateString(cell(row, 5));
    const end_date = toDateString(cell(row, 6));
    const academic_line = strOrNull(cell(row, 7), 150);
    const training = strOrNull(cell(row, 8));
    const experience = strOrNull(cell(row, 9));
    const dedication = strOrNull(cell(row, 11), 50);
    const schedule = strOrNull(cell(row, 12), 100);
    const campus = strOrNull(cell(row, 13), 100);
    const modality = strOrNull(cell(row, 14), 50);
    const subjects = strOrNull(cell(row, 15));
    const quantity = toInt(cell(row, 17), 1);
    const coordinator_document = toDocumentString(cell(row, 18));
    const lite_name = strOrNull(cell(row, 19));

    const observations = lite_name;

    const coordinator_id =
      coordinator_document != null
        ? coordinatorMap.get(coordinator_document) ?? null
        : null;

    const r = await pool.query(
      `INSERT INTO vacancies (
        origin, program, school, period, start_date, end_date, academic_line,
        training, experience, dedication, schedule, campus, modality, subjects,
        quantity, selected_count, hired_count, status, coordinator_id, observations
      ) VALUES (
        $1, $2, $3, $4, $5::date, $6::date, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20
      )`,
      [
        origin,
        program,
        school,
        PERIOD_FIXED,
        start_date,
        end_date,
        academic_line,
        training,
        experience,
        dedication,
        schedule,
        campus,
        modality,
        subjects,
        quantity,
        0,
        0,
        "open",
        coordinator_id,
        observations,
      ]
    );
    inserted += r.rowCount ?? 0;
  }

  return inserted;
}

async function main(): Promise<void> {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`No existe el archivo: ${XLSX_PATH}`);
  }

  const n = await seedProjection2026B();
  console.log(`✓ Vacantes 2026B insertadas: ${n}`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
