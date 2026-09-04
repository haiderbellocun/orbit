/**
 * Importa carga academica scrapeada (JSON ACA) hacia academic_workload.*.
 *
 * Flujo:
 *   1) Resuelve personas existentes (NO crea docentes)
 *   2) Valida: cupo, cruces de horario, tope vs balance de horas
 *   3) Registra import_run + circuit breaker de volumen
 *   4) Upsert subject/class_group; carga academic_load_stg
 *   5) TX: snapshot → DELETE/INSERT academic_load → cierra import_run
 *   6) Limpia class_group / subject huerfanos
 *   7) Excel + correo de data no congruente
 *
 * Uso (desde orbit-api):
 *   node scripts/import-academic-workload-from-json.mjs
 *   node scripts/import-academic-workload-from-json.mjs --source "C:/ruta/carga.json"
 *   node scripts/import-academic-workload-from-json.mjs --official
 *   node scripts/import-academic-workload-from-json.mjs --snapshot-type adhoc
 *   node scripts/import-academic-workload-from-json.mjs --imported-by scheduler
 *   node scripts/import-academic-workload-from-json.mjs --force
 *   node scripts/import-academic-workload-from-json.mjs --dry-run
 *   node scripts/import-academic-workload-from-json.mjs --validate-only
 *   node scripts/import-academic-workload-from-json.mjs --fail-on-validation
 *   node scripts/import-academic-workload-from-json.mjs --no-email
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import {
  DEFAULT_CLASS_PREPARATION_HOURS,
  parseTimeToMinutes,
  runImportValidations,
  summarizeValidationIssues,
} from "./lib/academicLoadImportValidation.mjs";
import {
  classifyFromAssignment,
  resolveStoredModality,
} from "./lib/acaBusinessRules.mjs";
import {
  sendIncongruentReportEmail,
  writeIncongruentExcel,
} from "./lib/incongruentWorkloadReport.mjs";
import {
  HISTORY_APP_VERSION,
  checkCircuitBreaker,
  commitStagingSwap,
  computeContentHashFromFile,
  computeDeltaMetrics,
  enrichStagingNames,
  failImportRun,
  getLastOkRun,
  insertImportRun,
  insertStagingRows,
  truncateStaging,
} from "./lib/academicLoadHistory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const DEFAULT_SOURCE = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY/descargas_carga_academica",
  "carga_academica__2026Q_26C11_26E03_26ES4_26ET2_26I33_26P04_26PI4_26T04_26V04__20260727_113642.json"
);

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}
const DRY_RUN = args.includes("--dry-run");
const VALIDATE_ONLY = args.includes("--validate-only");
const FAIL_ON_VALIDATION = args.includes("--fail-on-validation");
const NO_EMAIL = args.includes("--no-email");
const FORCE = args.includes("--force");
const OFFICIAL = args.includes("--official");
const SNAPSHOT_TYPE_ARG = argValue("--snapshot-type");
const IMPORTED_BY = argValue("--imported-by") || process.env.IMPORT_IMPORTED_BY || null;
const SOURCE = argValue("--source") || DEFAULT_SOURCE;
const PROGRESS_PATH =
  argValue("--progress") ||
  path.join(
    path.dirname(SOURCE),
    `import_carga_academica__progress__${stamp()}.json`
  );

function resolveSnapshotMeta() {
  if (OFFICIAL) {
    return { snapshotType: "daily_1700", isOfficial: true };
  }
  const t = SNAPSHOT_TYPE_ARG || "adhoc";
  if (!["daily_1700", "adhoc", "recovery"].includes(t)) {
    throw new Error(`--snapshot-type inválido: ${t}`);
  }
  return {
    snapshotType: t,
    isOfficial: t === "daily_1700",
  };
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function resolveSsl() {
  const explicit = String(process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return undefined;
  if (explicit === "true" || explicit === "1") {
    return {
      rejectUnauthorized:
        String(process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false")
          .trim()
          .toLowerCase() === "true",
    };
  }
  const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const schema = (process.env.DB_SCHEMA ?? "public").trim();
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME,
  options: `-c search_path=${schema},public`,
  ssl: resolveSsl(),
  connectionTimeoutMillis: 30000,
});

const VW50 = 50;
const VW100 = 100;
const VW150 = 150;
const VW250 = 250;
const MAX_ISSUES_IN_PROGRESS = 2000;

function truncateUtf(value, max) {
  if (value == null) return null;
  const s = String(value);
  if ([...s].length <= max) return s;
  return [...s].slice(0, max).join("");
}

function normDoc(value) {
  return String(value ?? "").replace(/[^\d]/g, "");
}

function normEmail(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  return s.includes("@") ? s : "";
}

/**
 * ACA Ocupación Docentes no exporta intensidad horaria (solo créditos y, a veces, horario).
 * Prioridad: subject.hours_quantity > duración del horario > créditos.
 */
function resolveSubjectHours(assignment) {
  const raw = assignment?.subject?.hours_quantity;
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }

  const start = parseTimeToMinutes(assignment?.class_group?.start_time);
  const end = parseTimeToMinutes(assignment?.class_group?.end_time);
  if (start != null && end != null && end > start) {
    const hours = (end - start) / 60;
    if (hours > 0) return Math.round(hours * 100) / 100;
  }

  const credits = assignment?.subject?.credits_quantity;
  if (credits != null && credits !== "") {
    const n = Number(credits);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function parseDateDMY(value) {
  if (!value) return null;
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function toPgTime(value) {
  const mins = parseTimeToMinutes(value);
  if (mins == null) return null;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

function scheduleText(cg) {
  const parts = [cg?.start_time, cg?.end_time].filter(Boolean);
  return parts.length ? parts.join(" - ") : null;
}

function writeProgress(progress) {
  progress.updated_at = new Date().toISOString();
  fs.writeFileSync(PROGRESS_PATH, JSON.stringify(progress, null, 2), "utf8");
}

async function upsertSubject(client, input) {
  const subjectCode = truncateUtf(input.subjectCode, VW50) ?? "";
  const subjectName = truncateUtf(input.name, VW250) ?? "";
  const hoursQuantity =
    input.hoursQuantity == null || Number.isNaN(Number(input.hoursQuantity))
      ? null
      : Number(input.hoursQuantity);

  const found = await client.query(
    `SELECT subject_code FROM academic_workload.subject WHERE subject_code = $1 LIMIT 1`,
    [subjectCode]
  );
  if (found.rows.length) {
    await client.query(
      `UPDATE academic_workload.subject
       SET
         name = COALESCE($2, name),
         credits_quantity = COALESCE($3, credits_quantity),
         hours_quantity = COALESCE($4, hours_quantity),
         updated_at = NOW()
       WHERE subject_code = $1`,
      [subjectCode, subjectName || null, input.creditsQuantity, hoursQuantity]
    );
    return { isNew: false };
  }
  await client.query(
    `INSERT INTO academic_workload.subject (
      subject_code, name, credits_quantity, hours_quantity, is_active
    ) VALUES ($1, $2, $3, COALESCE($4, 0), true)`,
    [subjectCode, subjectName, input.creditsQuantity, hoursQuantity]
  );
  return { isNew: true };
}

async function upsertClassGroup(client, input) {
  const subjectCode = truncateUtf(input.subjectCode, VW50) ?? "";
  const groupCode = truncateUtf(input.groupCode, VW50) ?? "";
  const classroomName = truncateUtf(input.classroomName, VW150);
  const block = truncateUtf(input.block, VW100);
  const scheduleTime = truncateUtf(input.scheduleTime, VW100);
  const modality = truncateUtf(input.modality, VW100);

  const found = await client.query(
    `SELECT id FROM academic_workload.class_group
     WHERE subject_code = $1 AND group_code = $2 LIMIT 1`,
    [subjectCode, groupCode]
  );
  if (found.rows.length) {
    const id = found.rows[0].id;
    await client.query(
      `UPDATE academic_workload.class_group SET
         start_date = COALESCE($1, start_date),
         end_date = COALESCE($2, end_date),
         start_time = COALESCE($3::time, start_time),
         end_time = COALESCE($4::time, end_time),
         classroom_name = COALESCE($5, classroom_name),
         capacity = COALESCE($6, capacity),
         block = COALESCE($7, block),
         schedule_type = COALESCE($8, schedule_type),
         modality = COALESCE($9, modality),
         updated_at = NOW()
       WHERE id = $10`,
      [
        input.startDate,
        input.endDate,
        input.startTime,
        input.endTime,
        classroomName,
        input.capacity,
        block,
        scheduleTime,
        modality,
        id,
      ]
    );
    return { id, isNew: false };
  }
  const inserted = await client.query(
    `INSERT INTO academic_workload.class_group (
      subject_code, group_code, start_date, end_date, start_time, end_time,
      classroom_name, capacity, block, schedule_type, modality
    ) VALUES ($1,$2,$3,$4,$5::time,$6::time,$7,$8,$9,$10,$11) RETURNING id`,
    [
      subjectCode,
      groupCode,
      input.startDate,
      input.endDate,
      input.startTime,
      input.endTime,
      classroomName,
      input.capacity,
      block,
      scheduleTime,
      modality,
    ]
  );
  return { id: inserted.rows[0]?.id ?? null, isNew: true };
}

async function resolvePersonTable(client) {
  const r = await client.query(
    `SELECT
       to_regclass('core.person') AS person_core,
       to_regclass('public.person') AS person_public`
  );
  const row = r.rows[0] ?? {};
  if (schema === "core" && row.person_core) return "core.person";
  if (row.person_core) return "core.person";
  if (row.person_public) return "public.person";
  throw new Error("No se encontro tabla person (core/public)");
}

function personPrefix(personTable) {
  return personTable.startsWith("core.") ? "core." : "";
}

/**
 * Índices de persona: documento (dígitos) y email/edu_email en minúsculas.
 * Varias personas en core.person tienen document NULL pero sí email institucional.
 */
async function preloadPersons(client, personTable, documents, emails) {
  const byDoc = new Map(); // docDigits -> person_id
  const byEmail = new Map(); // email -> person_id

  const uniqueDocs = [...new Set(documents.filter(Boolean))];
  const uniqueEmails = [...new Set(emails.filter(Boolean))];
  const CHUNK = 500;

  for (let i = 0; i < uniqueDocs.length; i += CHUNK) {
    const chunk = uniqueDocs.slice(i, i + CHUNK);
    const r = await client.query(
      `SELECT id,
              regexp_replace(COALESCE(document::text, ''), '[^0-9]', '', 'g') AS doc_digits
       FROM ${personTable}
       WHERE regexp_replace(COALESCE(document::text, ''), '[^0-9]', '', 'g') = ANY($1::text[])`,
      [chunk]
    );
    for (const row of r.rows) {
      if (row.doc_digits) byDoc.set(String(row.doc_digits), row.id);
    }
  }

  if (uniqueEmails.length) {
    for (let i = 0; i < uniqueEmails.length; i += CHUNK) {
      const chunk = uniqueEmails.slice(i, i + CHUNK);
      const r = await client.query(
        `SELECT id,
                lower(trim(COALESCE(edu_email, ''))) AS edu_email,
                lower(trim(COALESCE(email, ''))) AS email
         FROM ${personTable}
         WHERE lower(trim(COALESCE(edu_email, ''))) = ANY($1::text[])
            OR lower(trim(COALESCE(email, ''))) = ANY($1::text[])`,
        [chunk]
      );
      for (const row of r.rows) {
        if (row.edu_email) byEmail.set(String(row.edu_email), row.id);
        if (row.email) byEmail.set(String(row.email), row.id);
      }
    }
  }

  return { byDoc, byEmail };
}

function resolvePersonId(personMaps, doc, email) {
  if (doc && personMaps.byDoc.has(doc)) {
    return { personId: personMaps.byDoc.get(doc), matchBy: "document" };
  }
  if (email && personMaps.byEmail.has(email)) {
    return { personId: personMaps.byEmail.get(email), matchBy: "email" };
  }
  return { personId: null, matchBy: null };
}

/**
 * Contrato / preparación / sustantivas por person_id (mismo balance que Horas Sustantivas).
 */
async function preloadPersonHoursContexts(client, personTable, personIds) {
  const unique = [...new Set(personIds.filter((id) => id != null))];
  const map = new Map();
  if (!unique.length) return map;

  const prefix = personPrefix(personTable);
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const r = await client.query(
      `SELECT
         p.id AS person_id,
         p.document,
         p.full_name,
         ct.name AS contract_name,
         ct.work_schedule,
         COALESCE(cp.class_preparation_hours, $2) AS preparation_hours,
         COALESCE(sub.substantive_hours, 0) AS substantive_assigned
       FROM ${personTable} p
       LEFT JOIN ${prefix}contract_type ct ON ct.id = p.contract_type_id
       LEFT JOIN LATERAL (
         SELECT cp0.class_preparation_hours
         FROM academic_workload.class_preparation cp0
         WHERE cp0.person_id = p.id
         ORDER BY cp0.updated_at DESC NULLS LAST, cp0.id DESC
         LIMIT 1
       ) cp ON true
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(a.hours_quantity), 0) AS substantive_hours
         FROM substantive_hours.assignment a
         WHERE a.person_id = p.id
       ) sub ON true
       WHERE p.id = ANY($1::int[])`,
      [chunk, DEFAULT_CLASS_PREPARATION_HOURS]
    );
    for (const row of r.rows) {
      map.set(Number(row.person_id), {
        personId: Number(row.person_id),
        document: row.document != null ? String(row.document) : null,
        fullName: row.full_name != null ? String(row.full_name) : null,
        workSchedule:
          row.work_schedule != null ? String(row.work_schedule) : null,
        contractName:
          row.contract_name != null ? String(row.contract_name) : null,
        preparationHours: Number(row.preparation_hours) || DEFAULT_CLASS_PREPARATION_HOURS,
        substantiveAssigned: Number(row.substantive_assigned) || 0,
      });
    }
  }
  return map;
}

function buildNormalizedRows(assignments, personMaps) {
  const rows = [];
  const skipped = [];
  const hardErrors = [];
  let matchedByEmail = 0;

  for (let i = 0; i < assignments.length; i++) {
    const a = assignments[i];
    const doc = normDoc(a.person_document || a.teacher?.document);
    const email = normEmail(a.teacher?.email);
    const period = String(a.period_code || a.academic_load?.period_code || "");
    const subjectCode = String(a.subject?.subject_code || "").trim();
    const groupCode = String(a.class_group?.group_code || "").trim();

    if (!doc && !email) {
      skipped.push({
        index: i,
        reason: "sin_documento_ni_email",
        period,
        subject: subjectCode || null,
        group: groupCode || null,
      });
      continue;
    }

    const { personId, matchBy } = resolvePersonId(personMaps, doc, email);
    if (!personId) {
      skipped.push({
        index: i,
        reason: "docente_no_existe_en_orbit",
        document: doc || null,
        email: email || null,
        name: a.teacher?.name ?? null,
        period,
        subject: subjectCode || null,
        group: groupCode || null,
      });
      continue;
    }
    if (matchBy === "email") matchedByEmail += 1;

    if (!subjectCode || !groupCode || !period) {
      hardErrors.push({
        index: i,
        document: doc || null,
        email: email || null,
        error: "faltan subject/group/period",
      });
      continue;
    }

    const subjectHours = resolveSubjectHours(a);

    rows.push({
      index: i,
      personId,
      matchBy,
      document: doc || null,
      email: email || null,
      personName: a.teacher?.name ?? null,
      periodCode: period,
      subjectCode,
      groupCode,
      subjectHours,
      enrolledQuantity:
        a.class_group?.enrolled_quantity == null
          ? null
          : Number(a.class_group.enrolled_quantity),
      capacity:
        a.class_group?.capacity == null
          ? null
          : Number(a.class_group.capacity),
      startDate: parseDateDMY(a.class_group?.start_date),
      endDate: parseDateDMY(a.class_group?.end_date),
      startMinutes: parseTimeToMinutes(a.class_group?.start_time),
      endMinutes: parseTimeToMinutes(a.class_group?.end_time),
      block: a.class_group?.block ?? null,
      creditsQuantity:
        a.subject?.credits_quantity == null
          ? null
          : Number(a.subject.credits_quantity),
      modality: resolveStoredModality(a),
      raw: a,
    });
  }

  return { rows, skipped, hardErrors, matchedByEmail };
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`No existe source JSON: ${SOURCE}`);
  }
  const payload = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const rawAssignments = Array.isArray(payload.assignments)
    ? payload.assignments
    : [];
  const classifiedOut = [];
  const assignments = [];
  for (const a of rawAssignments) {
    const classified = classifyFromAssignment(a);
    if (!classified.includeInCarga) {
      classifiedOut.push({
        ...a,
        classification: {
          activity_kind: classified.activityKind,
          include_in_carga: false,
          tags: classified.tags,
          classification_rule: classified.classificationRule,
          classification_rules: classified.classificationRules,
          source_modality: classified.sourceModality,
          normalized_modality: classified.normalizedModality,
        },
      });
      continue;
    }
    assignments.push(a);
  }

  const progress = {
    started_at: new Date().toISOString(),
    finished_at: null,
    dry_run: DRY_RUN,
    validate_only: VALIDATE_ONLY,
    fail_on_validation: FAIL_ON_VALIDATION,
    source: SOURCE,
    progress_file: PROGRESS_PATH,
    source_meta: {
      generated_at: payload.generated_at ?? null,
      load_type: payload.load_type ?? null,
      rules_version: payload.rules_version ?? null,
      periods: (payload.periods || []).map((p) => p.period_code || p),
      total_assignments: assignments.length,
      total_assignments_raw: rawAssignments.length,
      classified_out: classifiedOut.length,
      create_teachers: false,
    },
    deleted: {
      academic_load: 0,
      class_group_orphans: 0,
      subject_orphans: 0,
    },
    counts_before: {},
    counts_after: {},
    totals: {
      processed: 0,
      ok: 0,
      skipped_missing_person: 0,
      matched_by_email: 0,
      errors: 0,
      validated_rows: 0,
    },
    upserts: {
      subject_new: 0,
      subject_existing: 0,
      class_group_new: 0,
      class_group_existing: 0,
      academic_load_new: 0,
      academic_load_existing: 0,
    },
    validation: {
      summary: { total: 0, by_code: {}, warnings: 0, errors: 0 },
      issues: [],
    },
    skipped_missing_person: [],
    classified_out: [],
    incongruent_report: null,
    email: null,
    errors: [],
    by_period: {},
  };

  writeProgress(progress);
  console.log(`Source: ${SOURCE}`);
  console.log(
    `Assignments carga: ${assignments.length} | fuera de carga: ${classifiedOut.length} | raw: ${rawAssignments.length}`
  );
  console.log(`Progress: ${PROGRESS_PATH}`);
  console.log(`Dry-run: ${DRY_RUN}`);
  console.log(`Validate-only: ${VALIDATE_ONLY}`);
  console.log(`Fail-on-validation: ${FAIL_ON_VALIDATION}`);
  console.log(`Official: ${OFFICIAL}`);
  console.log(`Force: ${FORCE}`);
  console.log(`Create teachers: false`);
  console.log(`Email report: ${NO_EMAIL ? "off" : "on"}`);

  const client = await pool.connect();
  try {
    const personTable = await resolvePersonTable(client);
    console.log(`Person table: ${personTable}`);

    const before = await client.query(`
      SELECT
        (SELECT COUNT(1)::int FROM academic_workload.academic_load) AS academic_load,
        (SELECT COUNT(1)::int FROM academic_workload.class_group) AS class_group,
        (SELECT COUNT(1)::int FROM academic_workload.subject) AS subject
    `);
    progress.counts_before = before.rows[0];
    writeProgress(progress);
    console.log("Counts before:", progress.counts_before);

    const docs = assignments.map((a) =>
      normDoc(a.person_document || a.teacher?.document)
    );
    const emails = assignments.map((a) => normEmail(a.teacher?.email));
    console.log("Precargando personas (documento + email)...");
    const personMaps = await preloadPersons(client, personTable, docs, emails);
    console.log(
      `Personas por doc: ${personMaps.byDoc.size} / ${new Set(docs.filter(Boolean)).size}`
    );
    console.log(
      `Personas por email: ${personMaps.byEmail.size} / ${new Set(emails.filter(Boolean)).size}`
    );

    const { rows, skipped, hardErrors, matchedByEmail } = buildNormalizedRows(
      assignments,
      personMaps
    );
    progress.totals.skipped_missing_person = skipped.length;
    progress.totals.matched_by_email = matchedByEmail;
    progress.skipped_missing_person = skipped;
    progress.classified_out = classifiedOut.map((a) => ({
      document: a.person_document || a.teacher?.document || null,
      name: a.teacher?.name ?? null,
      period: a.period_code,
      subject: a.subject?.subject_code || null,
      activity_kind: a.classification?.activity_kind,
    }));
    progress.errors.push(...hardErrors);
    progress.totals.errors += hardErrors.length;
    progress.totals.validated_rows = rows.length;
    console.log(`Matched by email fallback: ${matchedByEmail}`);

    console.log("Precargando contexto de horas (contrato/prep/sustantivas)...");
    const hoursContexts = await preloadPersonHoursContexts(
      client,
      personTable,
      rows.map((r) => r.personId)
    );
    console.log(`Contextos de horas: ${hoursContexts.size}`);

    console.log("Ejecutando validaciones de negocio...");
    const issues = runImportValidations(rows, hoursContexts);
    progress.validation.summary = summarizeValidationIssues(issues);
    progress.validation.issues = issues.slice(0, MAX_ISSUES_IN_PROGRESS);
    writeProgress(progress);
    console.log("Validation summary:", progress.validation.summary);

    async function emitIncongruentArtifacts() {
      const excelPath = path.join(
        path.dirname(SOURCE),
        `data_no_congruente__${stamp()}.xlsx`
      );
      try {
        const summary = await writeIncongruentExcel({
          outputPath: excelPath,
          progress,
          payload,
          skipped,
          hardErrors,
          classifiedOut,
        });
        progress.incongruent_report = {
          file: excelPath,
          people_count: summary.peopleCount,
          skipped_count: summary.skippedCount,
          excluded_count: summary.excludedCount,
        };
        console.log(`Reporte incongruente: ${excelPath}`);
        console.log(
          `  docentes sin match=${summary.peopleCount} | filas omitidas=${summary.skippedCount} | fuera de carga=${summary.excludedCount}`
        );

        if (NO_EMAIL) {
          progress.email = { sent: false, reason: "no_email_flag" };
        } else {
          try {
            progress.email = await sendIncongruentReportEmail({
              excelPath,
              summary: { ...summary, ok: progress.totals.ok },
              dryRun: DRY_RUN,
            });
            if (progress.email?.sent) {
              console.log(
                `Correo incongruente enviado a: ${(progress.email.to || []).join(", ")}`
              );
            } else {
              console.log(
                `Correo incongruente no enviado: ${progress.email?.reason}`
              );
            }
          } catch (err) {
            progress.email = { sent: false, reason: String(err?.message || err) };
            console.error("No se pudo enviar el correo de incongruencias:", err);
          }
        }
      } catch (err) {
        progress.incongruent_report = { error: String(err?.message || err) };
        console.error("No se pudo generar Excel de incongruencias:", err);
      }
      writeProgress(progress);
    }

    if (FAIL_ON_VALIDATION && issues.length > 0) {
      progress.finished_at = new Date().toISOString();
      await emitIncongruentArtifacts();
      console.error(
        `Abortado por --fail-on-validation (${issues.length} hallazgo(s)).`
      );
      process.exitCode = 2;
      return;
    }

    if (VALIDATE_ONLY) {
      progress.finished_at = new Date().toISOString();
      progress.counts_after = progress.counts_before;
      await emitIncongruentArtifacts();
      console.log("=".repeat(60));
      console.log("VALIDATE-ONLY DONE");
      console.log("Totals:", progress.totals);
      console.log("Validation:", progress.validation.summary);
      console.log("Progress JSON:", PROGRESS_PATH);
      return;
    }

    const snapshotMeta = resolveSnapshotMeta();
    const startedMs = Date.now();
    const contentHash = computeContentHashFromFile(SOURCE);
    const sourceStat = fs.statSync(SOURCE);
    const periodCodes = [
      ...new Set(rows.map((r) => r.periodCode).filter(Boolean)),
    ];

    progress.history = {
      snapshot_type: snapshotMeta.snapshotType,
      is_official: snapshotMeta.isOfficial,
      content_hash: contentHash,
      force: FORCE,
      app_version: HISTORY_APP_VERSION,
    };
    writeProgress(progress);

    console.log(
      `Snapshot: type=${snapshotMeta.snapshotType} official=${snapshotMeta.isOfficial} force=${FORCE}`
    );

    let runId = null;
    if (!DRY_RUN) {
      const run = await insertImportRun(client, {
        snapshotType: snapshotMeta.snapshotType,
        isOfficial: snapshotMeta.isOfficial,
        sourceFile: SOURCE,
        sourceFileSize: sourceStat.size,
        contentHash,
        periodCodes,
        status: "running",
        importedBy: IMPORTED_BY,
      });
      runId = run.id;
      progress.history.import_run_id = runId;
      progress.history.fecha_carga = run.fecha_carga;
      writeProgress(progress);
      console.log(`import_run id=${runId} fecha_carga=${run.fecha_carga}`);

      const lastOk = await getLastOkRun(client);
      const baselineCount =
        lastOk?.row_count != null
          ? Number(lastOk.row_count)
          : Number(progress.counts_before.academic_load) || null;
      const breaker = checkCircuitBreaker(rows.length, baselineCount);
      progress.history.circuit_breaker = breaker;
      if (!breaker.ok && !FORCE) {
        const msg = `Circuit breaker: nuevas=${breaker.newCount} último_ok=${breaker.lastOkCount} delta=${(breaker.ratio * 100).toFixed(1)}% > ${(breaker.threshold * 100).toFixed(0)}%`;
        await failImportRun(client, runId, msg, Date.now() - startedMs);
        progress.finished_at = new Date().toISOString();
        progress.history.status = "failed";
        progress.history.error = msg;
        await emitIncongruentArtifacts();
        console.error(msg);
        process.exitCode = 3;
        return;
      }
      if (!breaker.ok && FORCE) {
        console.warn(
          `Circuit breaker ignorado por --force (delta=${(breaker.ratio * 100).toFixed(1)}%)`
        );
      }

      const lastHash = lastOk?.content_hash ?? null;
      progress.history.has_changes_vs_last =
        lastHash == null ? true : lastHash !== contentHash;

      console.log("Upsert subject/class_group + staging...");
      await truncateStaging(client);

      /** Dedup por clave de negocio (+ aca_group_id); gana la última fila. */
      const stagingByKey = new Map();
      const stagingRows = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const a = row.raw;
        progress.totals.processed = i + 1;
        progress.by_period[row.periodCode] ??= { ok: 0, skipped: 0, errors: 0 };

        try {
          const s = await upsertSubject(client, {
            subjectCode: row.subjectCode,
            name: a.subject?.name || row.subjectCode,
            creditsQuantity:
              a.subject?.credits_quantity == null
                ? null
                : Number(a.subject.credits_quantity),
            hoursQuantity: row.subjectHours > 0 ? row.subjectHours : null,
          });
          if (s.isNew) progress.upserts.subject_new += 1;
          else progress.upserts.subject_existing += 1;

          const g = await upsertClassGroup(client, {
            subjectCode: row.subjectCode,
            groupCode: row.groupCode,
            startDate: row.startDate,
            endDate: row.endDate,
            startTime: toPgTime(a.class_group?.start_time),
            endTime: toPgTime(a.class_group?.end_time),
            classroomName: a.class_group?.classroom ?? null,
            capacity: row.capacity,
            block: row.block,
            scheduleTime: scheduleText(a.class_group),
            modality: resolveStoredModality(a),
          });
          if (g.isNew) progress.upserts.class_group_new += 1;
          else progress.upserts.class_group_existing += 1;

          const acaGroupId = truncateUtf(a.meta?.id_grupo ?? null, VW50) || null;
          const semester =
            a.academic_load?.semester == null || a.academic_load?.semester === ""
              ? null
              : truncateUtf(String(a.academic_load.semester), VW50);
          const programName = truncateUtf(
            a.academic_load?.program_name ?? null,
            VW250
          );
          const bizKey = [
            row.periodCode,
            row.subjectCode,
            row.groupCode,
            row.personId,
            acaGroupId ?? "",
          ].join("|");

          const stgRow = {
            personId: row.personId,
            periodCode: truncateUtf(row.periodCode, VW50),
            semester,
            programId: null,
            programName,
            subjectCode: truncateUtf(row.subjectCode, VW50),
            groupCode: truncateUtf(row.groupCode, VW50),
            acaGroupId,
            enrolledQuantity: row.enrolledQuantity ?? 0,
            regionId: null,
            cityId: null,
            campusId: null,
            substantiveCategoryId: null,
            substantiveHoursQuantity: row.subjectHours ?? 0,
            classPreparationId: null,
            teacherFullName: row.personName ?? null,
            subjectName: a.subject?.name || row.subjectCode,
            regionName: null,
            cityName: null,
            campusName: null,
          };
          stagingByKey.set(bizKey, stgRow);

          progress.totals.ok += 1;
          progress.by_period[row.periodCode].ok += 1;
        } catch (err) {
          progress.totals.errors += 1;
          progress.by_period[row.periodCode].errors += 1;
          progress.errors.push({
            index: row.index,
            document: row.document,
            period: row.periodCode,
            subject: row.subjectCode,
            group: row.groupCode,
            error: String(err?.message || err),
          });
        }

        if ((i + 1) % 100 === 0 || i === rows.length - 1) {
          writeProgress(progress);
          console.log(
            `Progreso ${i + 1}/${rows.length} | ok=${progress.totals.ok} skip=${progress.totals.skipped_missing_person} err=${progress.totals.errors}`
          );
        }
      }

      for (const stgRow of stagingByKey.values()) {
        stagingRows.push(stgRow);
      }
      progress.upserts.academic_load_new = stagingRows.length;
      progress.upserts.academic_load_existing = 0;

      await insertStagingRows(client, stagingRows);
      await enrichStagingNames(client, personTable);
      const delta = await computeDeltaMetrics(client);
      const hasChanges =
        progress.history.has_changes_vs_last ||
        delta.added > 0 ||
        delta.removed > 0 ||
        delta.changed > 0;
      progress.history.delta = delta;
      progress.history.has_changes = hasChanges;
      writeProgress(progress);
      console.log("Delta:", delta, "has_changes=", hasChanges);

      const fechaCarga = progress.history.fecha_carga;
      try {
        const swap = await commitStagingSwap(client, {
          runId,
          fechaCarga,
          metrics: {
            hasChanges,
            rowCount: stagingRows.length,
            added: delta.added,
            removed: delta.removed,
            changed: delta.changed,
          },
          durationMs: Date.now() - startedMs,
        });
        progress.deleted.academic_load = swap.deleted;
        progress.history.status = "ok";
        console.log(
          `Swap OK: deleted=${swap.deleted} inserted=${stagingRows.length} run=${runId}`
        );
      } catch (err) {
        const msg = String(err?.message || err);
        await failImportRun(client, runId, msg, Date.now() - startedMs);
        progress.history.status = "failed";
        progress.history.error = msg;
        progress.finished_at = new Date().toISOString();
        writeProgress(progress);
        await emitIncongruentArtifacts();
        throw err;
      }

      const delGroups = await client.query(`
        DELETE FROM academic_workload.class_group cg
        WHERE NOT EXISTS (
          SELECT 1 FROM academic_workload.academic_load al
          WHERE al.subject_code = cg.subject_code AND al.group_code = cg.group_code
        )
      `);
      progress.deleted.class_group_orphans = delGroups.rowCount ?? 0;

      const delSubjects = await client.query(`
        DELETE FROM academic_workload.subject s
        WHERE NOT EXISTS (
          SELECT 1 FROM academic_workload.class_group cg
          WHERE cg.subject_code = s.subject_code
        )
      `);
      progress.deleted.subject_orphans = delSubjects.rowCount ?? 0;
      writeProgress(progress);
      console.log("Deleted orphans:", {
        class_group: progress.deleted.class_group_orphans,
        subject: progress.deleted.subject_orphans,
      });
    } else {
      // dry-run: simula conteos sin tocar DB
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        progress.totals.processed = i + 1;
        progress.totals.ok += 1;
        progress.by_period[row.periodCode] ??= { ok: 0, skipped: 0, errors: 0 };
        progress.by_period[row.periodCode].ok += 1;
      }
      progress.history.status = "dry_run";
    }

    // Contabilizar skips por periodo (solo resumen)
    for (const s of skipped) {
      const period = s.period || "?";
      progress.by_period[period] ??= { ok: 0, skipped: 0, errors: 0 };
      progress.by_period[period].skipped += 1;
    }

    const after = await client.query(`
      SELECT
        (SELECT COUNT(1)::int FROM academic_workload.academic_load) AS academic_load,
        (SELECT COUNT(1)::int FROM academic_workload.class_group) AS class_group,
        (SELECT COUNT(1)::int FROM academic_workload.subject) AS subject
    `);
    progress.counts_after = after.rows[0];
    progress.finished_at = new Date().toISOString();
    await emitIncongruentArtifacts();

    console.log("=".repeat(60));
    console.log("DONE (sin crear docentes)");
    console.log("Deleted:", progress.deleted);
    console.log("Totals:", progress.totals);
    console.log("Upserts:", progress.upserts);
    console.log("History:", progress.history);
    console.log("Validation:", progress.validation.summary);
    console.log("Counts after:", progress.counts_after);
    console.log("Progress JSON:", PROGRESS_PATH);
    if (progress.incongruent_report?.file) {
      console.log("Reporte incongruente:", progress.incongruent_report.file);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
