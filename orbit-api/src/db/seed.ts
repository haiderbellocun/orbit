import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { pool } from "./connection";

const XLSX_PATH = path.resolve("C:/app_orbit/Docentes 2026A con datos.xlsx");

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

/** Excel serial (días desde 1899-12-30 UTC) → YYYY-MM-DD */
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

function mapTeacherStatus(val: unknown): string {
  if (val == null || val === "") return "inactive";
  return String(val).trim() === "Ok" ? "active" : "inactive";
}

function mapVacancyStatus(val: unknown): string {
  if (val == null || val === "") return "open";
  const s = String(val).trim();
  if (s === "Seleccionado") return "in-progress";
  if (s === "Contratado") return "filled";
  if (s === "Anulado") return "cancelled";
  return "open";
}

/** Texto plano para status; si es fórmula Excel (=...) devuelve null */
function parseReinstatementStatus(val: unknown): string | null {
  if (val == null || val === "") return null;
  const s = String(val).trim();
  if (s.startsWith("=")) return null;
  return s;
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

async function seedCoordinators(): Promise<number> {
  const rows = sheetRows("Base Coordinadores");
  let inserted = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const document = toDocumentString(cell(row, 4));
    if (document == null) continue;
    const name = strOrNull(cell(row, 5), 150);
    if (name == null) continue;
    const school = strOrNull(cell(row, 1), 150);
    const cv_link = strOrNull(cell(row, 6), 255);
    const email = strOrNull(cell(row, 7), 100);
    const campus = strOrNull(cell(row, 9), 100);

    const r = await pool.query(
      `INSERT INTO coordinators (document, name, email, campus, school, cv_link, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       ON CONFLICT (document) DO NOTHING`,
      [document, name, email, campus, school, cv_link]
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

async function seedTeachers(coordinatorMap: Map<string, number>): Promise<number> {
  const rows = sheetRows("Base Principal");
  let inserted = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const document = toDocumentString(cell(row, 1));
    if (document == null) continue;

    const first_name = strOrNull(cell(row, 2), 100) ?? "";
    const last_name = strOrNull(cell(row, 3), 100) ?? "";
    if (first_name === "" && last_name === "") continue;

    const contract_type = strOrNull(cell(row, 4), 5);
    const start_date = toDateString(cell(row, 5));
    const end_date = toDateString(cell(row, 6));
    const program = strOrNull(cell(row, 12), 150);
    const area = strOrNull(cell(row, 14), 100);
    const modality = strOrNull(cell(row, 17), 50);
    const status = mapTeacherStatus(cell(row, 18));
    const school = strOrNull(cell(row, 22), 150);
    const coordinator_document = toDocumentString(cell(row, 23));
    const email = strOrNull(cell(row, 26), 100);
    const position = strOrNull(cell(row, 11), 150);
    const payroll_class = strOrNull(cell(row, 16), 100);

    const coordinator_id =
      coordinator_document != null
        ? coordinatorMap.get(coordinator_document) ?? null
        : null;

    const r = await pool.query(
      `INSERT INTO teachers (
        document, first_name, last_name, email, contract_type, start_date, end_date,
        program, school, campus, area, modality, position, payroll_class,
        coordinator_id, status
      ) VALUES (
        $1, $2, $3, $4, $5, $6::date, $7::date,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16
      )
      ON CONFLICT (document) DO NOTHING`,
      [
        document,
        first_name,
        last_name,
        email,
        contract_type,
        start_date,
        end_date,
        program,
        school,
        null,
        area,
        modality,
        position,
        payroll_class,
        coordinator_id,
        status,
      ]
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

async function seedVacancies(coordinatorMap: Map<string, number>): Promise<number> {
  const rows = sheetRows("Vacantes Nuevas 2026A");
  let inserted = 0;
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (cell(row, 0) == null || cell(row, 0) === "") continue;
    const program = strOrNull(cell(row, 2), 150);
    if (program == null) continue;

    const origin = strOrNull(cell(row, 1), 50);
    const school = strOrNull(cell(row, 3), 150);
    const period = strOrNull(cell(row, 4), 20);
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
    const observations = strOrNull(cell(row, 20));
    const status = mapVacancyStatus(cell(row, 22));
    const selected_count = toInt(cell(row, 23), 0);
    const hired_count = toInt(cell(row, 24), 0);

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
        period,
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
        selected_count,
        hired_count,
        status,
        coordinator_id,
        observations,
      ]
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

async function seedReinstatements(): Promise<number> {
  const rows = sheetRows("Base Reintegros");
  let inserted = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawDoc = toDocumentString(cell(row, 0));
    if (rawDoc == null) continue;
    const teacher_document = rawDoc;

    const first_name = strOrNull(cell(row, 1), 100) ?? "";
    const last_name = strOrNull(cell(row, 2), 100) ?? "";
    const teacher_name = `${first_name} ${last_name}`.trim() || null;
    const teacher_name_final = teacher_name
      ? teacher_name.slice(0, 200)
      : null;

    const contract_type = strOrNull(cell(row, 3), 5);
    const start_date = toDateString(cell(row, 4));
    const end_date = toDateString(cell(row, 5));
    const position = strOrNull(cell(row, 6), 150);
    const program = strOrNull(cell(row, 7), 150);
    const campusArea = strOrNull(cell(row, 9), 100);
    const campusConfirmed = strOrNull(cell(row, 17), 100);
    const campus = campusConfirmed ?? campusArea;
    const decision = strOrNull(cell(row, 13), 50);
    const period = strOrNull(cell(row, 14), 20);
    const modality = strOrNull(cell(row, 15), 50);
    const dedication = strOrNull(cell(row, 16), 50);
    const observations = strOrNull(cell(row, 18));
    const final_decision = strOrNull(cell(row, 22), 50);
    const statusRaw = parseReinstatementStatus(cell(row, 26));
    const status = statusRaw ?? "pending";

    const r = await pool.query(
      `INSERT INTO reinstatements (
        teacher_document, teacher_name, contract_type, start_date, end_date,
        position, program, school, campus, modality, dedication,
        decision, final_decision, period, observations, status
      ) VALUES (
        $1, $2, $3, $4::date, $5::date,
        $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16
      )`,
      [
        teacher_document,
        teacher_name_final,
        contract_type,
        start_date,
        end_date,
        position,
        program,
        null,
        campus,
        modality,
        dedication,
        decision,
        final_decision,
        period,
        observations,
        strOrNull(status, 30) ?? "pending",
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

  const nCoord = await seedCoordinators();
  const coordMap = await loadCoordinatorMap();

  const nTeachers = await seedTeachers(coordMap);
  const nVac = await seedVacancies(coordMap);
  const nRein = await seedReinstatements();

  console.log(`✓ Coordinadores insertados: ${nCoord}`);
  console.log(`✓ Docentes insertados: ${nTeachers}`);
  console.log(`✓ Vacantes insertadas: ${nVac}`);
  console.log(`✓ Reintegros insertados: ${nRein}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
