import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import pg from "pg";
import { fileURLToPath } from "url";

dotenv.config({ override: true });

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resolveSsl() {
  const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
  const flag = (process.env.DB_SSL ?? "").trim().toLowerCase();
  const sslMode = (process.env.PGSSLMODE ?? "").trim().toLowerCase();

  if (flag === "false" || flag === "0") return undefined;
  if (flag === "true" || flag === "1") {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    return { rejectUnauthorized };
  }
  if (
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full" ||
    !isLocal
  ) {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    return { rejectUnauthorized };
  }
  return undefined;
}

const STATUS_LABELS = {
  open: "Abierta",
  selected: "Seleccionada",
  requisition_sent: "Requisición enviada",
  hired: "Contratada",
  closed: "Cerrada",
  cancelled: "Cancelada",
  cancelled_by_capital: "Cancelada por capital",
};

function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtDate(v) {
  if (v == null) return "";
  const d = v instanceof Date ? v : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toISOString();
}

function boolLabel(v) {
  if (v === null || v === undefined) return "";
  return v ? "Sí" : "No";
}

async function resolveCoreSchema(pool) {
  const preferred = (process.env.DB_SCHEMA ?? "").trim().toLowerCase();
  const { rows } = await pool.query(`
    SELECT
      to_regclass('public.area') AS area_public,
      to_regclass('core.area') AS area_core,
      to_regclass('public.school') AS school_public,
      to_regclass('core.school') AS school_core,
      to_regclass('public.program') AS program_public,
      to_regclass('core.program') AS program_core
  `);
  const row = rows[0] ?? {};
  if (preferred === "core" && row.area_core && row.school_core && row.program_core)
    return "core";
  if (row.area_public && row.school_public && row.program_public) return "public";
  if (row.area_core && row.school_core && row.program_core) return "core";
  return null;
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  ssl: resolveSsl(),
  connectionTimeoutMillis: 15_000,
});

const main = async () => {
  const mode = await resolveCoreSchema(pool);
  if (mode == null) {
    throw new Error("CORE catalog (area/school/program) is not available");
  }
  const prefix = mode === "core" ? "core." : "public.";

  const { rows } = await pool.query(`
    SELECT
      v.public_id,
      v.id,
      a.name AS area_name,
      s.name AS school_name,
      p.name AS program_name,
      v.position_name,
      v.curricular_line,
      v.direct_manager_identification,
      v.quantity,
      v.hired_quantity,
      v.operation_status,
      r.req_number,
      r.assigned_at AS req_assigned_at,
      r.sent_to_capital_at,
      r.capital_notes,
      r.shortlist_complied,
      r.pda_complied,
      r.contract_conditions_complied,
      r.pre_interview_cv_complied,
      v.created_at,
      v.updated_at,
      v.closed_at,
      (
        SELECT string_agg(n.body, ' | ' ORDER BY n.created_at ASC)
        FROM vacancies.vacancy_operation_note n
        WHERE n.vacancy_id = v.id
      ) AS operation_notes
    FROM vacancies.vacancy v
    JOIN ${prefix}area a ON a.id = v.area_id
    LEFT JOIN ${prefix}school s ON s.id = v.school_id
    LEFT JOIN ${prefix}program p ON p.id = v.program_id
    LEFT JOIN vacancies.requisition r ON r.vacancy_id = v.id
    ORDER BY v.public_id ASC NULLS LAST, v.created_at DESC
  `);

  const headers = [
    "ID",
    "UUID",
    "Área",
    "Escuela",
    "Programa",
    "Cargo",
    "Línea curricular",
    "Jefe inmediato",
    "Cantidad",
    "Contratados",
    "Estado",
    "Estado (código)",
    "Núm. requisición",
    "REQ asignada en",
    "Enviada a capital",
    "Notas capital",
    "Shortlist cumplido",
    "PDA cumplido",
    "Condiciones contrato cumplido",
    "Pre-entrevista CV cumplido",
    "Creada",
    "Actualizada",
    "Cerrada",
    "Notas de operación",
  ];

  const lines = [headers.map(csvEscape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.public_id,
        r.id,
        r.area_name,
        r.school_name,
        r.program_name,
        r.position_name,
        r.curricular_line,
        r.direct_manager_identification,
        r.quantity,
        r.hired_quantity,
        STATUS_LABELS[r.operation_status] ?? r.operation_status,
        r.operation_status,
        r.req_number,
        fmtDate(r.req_assigned_at),
        fmtDate(r.sent_to_capital_at),
        r.capital_notes,
        boolLabel(r.shortlist_complied),
        boolLabel(r.pda_complied),
        boolLabel(r.contract_conditions_complied),
        boolLabel(r.pre_interview_cv_complied),
        fmtDate(r.created_at),
        fmtDate(r.updated_at),
        fmtDate(r.closed_at),
        r.operation_notes,
      ]
        .map(csvEscape)
        .join(",")
    );
  }

  const outPath = path.resolve(
    __dirname,
    "..",
    "..",
    `vacantes-export-${new Date().toISOString().slice(0, 10)}.csv`
  );
  // BOM for Excel compatibility with Spanish headers
  fs.writeFileSync(outPath, "\uFEFF" + lines.join("\r\n"), "utf8");
  console.log(`Exported ${rows.length} vacancies → ${outPath}`);
};

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
