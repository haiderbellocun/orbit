import fs from "fs";
import path from "path";
import * as XLSX from "xlsx";
import { pool } from "./connection";

const XLSX_PATH = path.resolve("C:/app_orbit/Docentes 2026A con datos.xlsx");
const ACADEMIC_BATCH = 500;

type Row = unknown[];

function cell(row: Row, idx: number): unknown {
  return idx < row.length ? row[idx] : undefined;
}

/** Documentos: null si vacío o fórmula Excel; si no, Math.round(Number).toString() */
function toDoc(val: unknown): string | null {
  if (val == null || val === undefined) return null;
  if (typeof val === "string" && val.trim().startsWith("=")) return null;
  if (val === "") return null;
  const n = Number(val);
  if (!Number.isNaN(n)) return Math.round(n).toString();
  const s = String(val).trim();
  return s === "" ? null : s;
}

function strOrNull(val: unknown, maxLen?: number): string | null {
  if (val == null || val === "") return null;
  let s = String(val).trim();
  if (s === "") return null;
  if (maxLen != null && s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function toCredits(val: unknown): number | null {
  if (val == null || val === "") return null;
  const n = Number.parseFloat(String(val).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** group_id / códigos numéricos como string sin decimales */
function toDocOrString(val: unknown, maxLen: number): string | null {
  if (val == null || val === "") return null;
  if (typeof val === "string" && val.trim().startsWith("=")) return null;
  const n = Number(val);
  if (!Number.isNaN(n)) {
    const s = Math.round(n).toString();
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  }
  return strOrNull(val, maxLen);
}

function mapLiteStatus(val: unknown): string {
  return String(val ?? "").trim() === "Activo" ? "active" : "inactive";
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

type AcademicRow = {
  teacher_document: string;
  teacher_name: string | null;
  email: string | null;
  modality_code: string | null;
  modality: string | null;
  period: string | null;
  level_num: string | null;
  unit_code: string | null;
  unit_name: string | null;
  pensum_code: string | null;
  subject_code: string | null;
  subject_name: string | null;
  credits: number | null;
  group_id: string | null;
  type: string;
};

function mapAcademicRow(row: Row, type: "current" | "projection"): AcademicRow | null {
  const teacher_document = toDoc(cell(row, 0));
  if (teacher_document == null) return null;

  return {
    teacher_document,
    teacher_name: strOrNull(cell(row, 1), 200),
    email: strOrNull(cell(row, 2), 100),
    modality_code: toDocOrString(cell(row, 3), 10),
    modality: strOrNull(cell(row, 4), 10),
    period: strOrNull(cell(row, 5), 20),
    level_num: strOrNull(cell(row, 6), 10),
    unit_code: strOrNull(cell(row, 7), 20),
    unit_name: strOrNull(cell(row, 8), 150),
    pensum_code: strOrNull(cell(row, 9), 20),
    subject_code: strOrNull(cell(row, 10), 20),
    subject_name: strOrNull(cell(row, 11), 200),
    credits: toCredits(cell(row, 12)),
    group_id: toDocOrString(cell(row, 14), 20),
    type,
  };
}

async function seedLites(): Promise<number> {
  const rows = sheetRows("Base Lite");
  let inserted = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const document = toDoc(cell(row, 2));
    if (document == null) continue;

    const school = strOrNull(cell(row, 0), 150);
    const coordinator_name = strOrNull(cell(row, 1), 150);
    const name = strOrNull(cell(row, 3), 150);
    if (name == null) continue;

    const email = strOrNull(cell(row, 4), 100);
    const program = strOrNull(cell(row, 5), 150);
    const academic_line = strOrNull(cell(row, 6), 150);
    const cv_link = strOrNull(cell(row, 7), 255);
    const coordinator_document = toDoc(cell(row, 8));
    const status = mapLiteStatus(cell(row, 9));

    const r = await pool.query(
      `INSERT INTO lites (
        document, name, email, program, school, academic_line, cv_link,
        coordinator_document, coordinator_name, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (document) DO NOTHING`,
      [
        document,
        name,
        email,
        program,
        school,
        academic_line,
        cv_link,
        coordinator_document,
        coordinator_name,
        status,
      ]
    );
    inserted += r.rowCount ?? 0;
  }
  return inserted;
}

async function insertAcademicLoadBatched(rows: AcademicRow[]): Promise<number> {
  if (rows.length === 0) return 0;

  let inserted = 0;
  for (let i = 0; i < rows.length; i += ACADEMIC_BATCH) {
    const batch = rows.slice(i, i + ACADEMIC_BATCH);
    const td: string[] = [];
    const tn: (string | null)[] = [];
    const em: (string | null)[] = [];
    const mc: (string | null)[] = [];
    const md: (string | null)[] = [];
    const pe: (string | null)[] = [];
    const ln: (string | null)[] = [];
    const uc: (string | null)[] = [];
    const un: (string | null)[] = [];
    const pc: (string | null)[] = [];
    const sc: (string | null)[] = [];
    const sn: (string | null)[] = [];
    const cr: (number | null)[] = [];
    const gid: (string | null)[] = [];
    const tp: string[] = [];

    for (const r of batch) {
      td.push(r.teacher_document);
      tn.push(r.teacher_name);
      em.push(r.email);
      mc.push(r.modality_code);
      md.push(r.modality);
      pe.push(r.period);
      ln.push(r.level_num);
      uc.push(r.unit_code);
      un.push(r.unit_name);
      pc.push(r.pensum_code);
      sc.push(r.subject_code);
      sn.push(r.subject_name);
      cr.push(r.credits);
      gid.push(r.group_id);
      tp.push(r.type);
    }

    await pool.query(
      `INSERT INTO academic_load (
        teacher_document, teacher_name, email, modality_code, modality, period,
        level_num, unit_code, unit_name, pensum_code, subject_code, subject_name,
        credits, group_id, type
      )
      SELECT * FROM unnest(
        $1::text[],
        $2::text[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::text[],
        $7::text[],
        $8::text[],
        $9::text[],
        $10::text[],
        $11::text[],
        $12::text[],
        $13::numeric[],
        $14::text[],
        $15::text[]
      ) AS x(
        teacher_document, teacher_name, email, modality_code, modality, period,
        level_num, unit_code, unit_name, pensum_code, subject_code, subject_name,
        credits, group_id, type
      )`,
      [td, tn, em, mc, md, pe, ln, uc, un, pc, sc, sn, cr, gid, tp]
    );
    inserted += batch.length;
  }
  return inserted;
}

function collectAcademicRows(
  sheetName: string,
  type: "current" | "projection"
): AcademicRow[] {
  const rows = sheetRows(sheetName);
  const out: AcademicRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const mapped = mapAcademicRow(rows[i], type);
    if (mapped != null) out.push(mapped);
  }
  return out;
}

async function main(): Promise<void> {
  if (!fs.existsSync(XLSX_PATH)) {
    throw new Error(`No existe el archivo: ${XLSX_PATH}`);
  }

  const nLites = await seedLites();

  const currentRows = collectAcademicRows("ACA 26V01", "current");
  const nCurrent = await insertAcademicLoadBatched(currentRows);

  const projectionRows = collectAcademicRows("ACA Poeccion", "projection");
  const nProjection = await insertAcademicLoadBatched(projectionRows);

  console.log(`✓ LITEs insertados: ${nLites}`);
  console.log(`✓ Carga académica actual insertada: ${nCurrent}`);
  console.log(`✓ Carga académica proyección insertada: ${nProjection}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
