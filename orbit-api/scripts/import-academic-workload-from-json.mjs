/**
 * Importa carga academica scrapeada (JSON ACA) hacia academic_workload.*.
 *
 * Flujo:
 *   1) DELETE academic_workload.academic_load (carga actual)
 *   2) Limpia class_group / subject huerfanos
 *   3) Por cada assignment: subject -> class_group -> academic_load
 *   4) Escribe JSON de progreso/resultados
 *
 * Uso (desde orbit-api):
 *   node scripts/import-academic-workload-from-json.mjs
 *   node scripts/import-academic-workload-from-json.mjs --source "C:/ruta/carga.json"
 *   node scripts/import-academic-workload-from-json.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

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
const SOURCE = argValue("--source") || DEFAULT_SOURCE;
const PROGRESS_PATH =
  argValue("--progress") ||
  path.join(
    path.dirname(SOURCE),
    `import_carga_academica__progress__${stamp()}.json`
  );

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

function truncateUtf(value, max) {
  if (value == null) return null;
  const s = String(value);
  if ([...s].length <= max) return s;
  return [...s].slice(0, max).join("");
}

function normDoc(value) {
  return String(value ?? "").replace(/[^\d]/g, "");
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
  const found = await client.query(
    `SELECT subject_code FROM academic_workload.subject WHERE subject_code = $1 LIMIT 1`,
    [subjectCode]
  );
  if (found.rows.length) return { isNew: false };
  await client.query(
    `INSERT INTO academic_workload.subject (subject_code, name, credits_quantity, is_active)
     VALUES ($1, $2, $3, true)`,
    [subjectCode, subjectName, input.creditsQuantity]
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
         classroom_name = COALESCE($3, classroom_name),
         capacity = COALESCE($4, capacity),
         block = COALESCE($5, block),
         schedule_type = COALESCE($6, schedule_type),
         modality = COALESCE($7, modality)
       WHERE id = $8`,
      [
        input.startDate,
        input.endDate,
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
      subject_code, group_code, start_date, end_date, classroom_name,
      capacity, block, schedule_type, modality
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [
      subjectCode,
      groupCode,
      input.startDate,
      input.endDate,
      classroomName,
      input.capacity,
      block,
      scheduleTime,
      modality,
    ]
  );
  return { id: inserted.rows[0]?.id ?? null, isNew: true };
}

async function upsertAcademicLoad(client, input) {
  const periodCode = truncateUtf(input.periodCode, VW50) ?? "";
  const semester =
    input.semester == null || input.semester === ""
      ? null
      : truncateUtf(String(input.semester), VW50);
  const subjectCode = truncateUtf(input.subjectCode, VW50) ?? "";
  const groupCode = truncateUtf(input.groupCode, VW50) ?? "";
  const programName = truncateUtf(input.programName, VW250);
  const enrolled = input.enrolledQuantity ?? 0;
  const substantiveHours = input.substantiveHoursQuantity ?? 0;

  const found = await client.query(
    `SELECT id FROM academic_workload.academic_load
     WHERE person_id = $1
       AND subject_code = $2
       AND group_code = $3
       AND COALESCE(period_code, '') = COALESCE($4, '')
     LIMIT 1`,
    [input.personId, subjectCode, groupCode, periodCode]
  );

  if (found.rows.length) {
    const id = found.rows[0].id;
    await client.query(
      `UPDATE academic_workload.academic_load SET
         semester = COALESCE($1, semester),
         program_name = COALESCE($2, program_name),
         enrolled_quantity = COALESCE($3, enrolled_quantity),
         substantive_hours_quantity = $4
       WHERE id = $5`,
      [semester, programName, input.enrolledQuantity, substantiveHours, id]
    );
    return { id, isNew: false };
  }

  const inserted = await client.query(
    `INSERT INTO academic_workload.academic_load (
      person_id, period_code, semester, program_id, program_name, subject_code,
      group_code, enrolled_quantity, region_id, city_id, campus_id,
      substantive_category_id, substantive_hours_quantity, class_preparation_id
    ) VALUES (
      $1,$2,$3,NULL,$4,$5,
      $6,$7,NULL,NULL,NULL,
      NULL,$8,NULL
    ) RETURNING id`,
    [
      input.personId,
      periodCode,
      semester,
      programName,
      subjectCode,
      groupCode,
      enrolled,
      substantiveHours,
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

async function preloadPersons(client, personTable, documents) {
  const unique = [...new Set(documents.filter(Boolean))];
  const map = new Map(); // docDigits -> person_id
  const CHUNK = 500;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const chunk = unique.slice(i, i + CHUNK);
    const r = await client.query(
      `SELECT id, document,
              regexp_replace(COALESCE(document::text, ''), '[^0-9]', '', 'g') AS doc_digits
       FROM ${personTable}
       WHERE regexp_replace(COALESCE(document::text, ''), '[^0-9]', '', 'g') = ANY($1::text[])`,
      [chunk]
    );
    for (const row of r.rows) {
      if (row.doc_digits) map.set(String(row.doc_digits), row.id);
    }
  }
  return map;
}

async function main() {
  if (!fs.existsSync(SOURCE)) {
    throw new Error(`No existe source JSON: ${SOURCE}`);
  }
  const payload = JSON.parse(fs.readFileSync(SOURCE, "utf8"));
  const assignments = Array.isArray(payload.assignments) ? payload.assignments : [];

  const progress = {
    started_at: new Date().toISOString(),
    finished_at: null,
    dry_run: DRY_RUN,
    source: SOURCE,
    progress_file: PROGRESS_PATH,
    source_meta: {
      generated_at: payload.generated_at ?? null,
      load_type: payload.load_type ?? null,
      periods: (payload.periods || []).map((p) => p.period_code),
      total_assignments: assignments.length,
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
      errors: 0,
    },
    upserts: {
      subject_new: 0,
      subject_existing: 0,
      class_group_new: 0,
      class_group_existing: 0,
      academic_load_new: 0,
      academic_load_existing: 0,
    },
    skipped_missing_person: [],
    errors: [],
    by_period: {},
  };

  writeProgress(progress);
  console.log(`Source: ${SOURCE}`);
  console.log(`Assignments: ${assignments.length}`);
  console.log(`Progress: ${PROGRESS_PATH}`);
  console.log(`Dry-run: ${DRY_RUN}`);

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

    if (!DRY_RUN) {
      console.log("Borrando academic_load actual...");
      const delLoad = await client.query(
        `DELETE FROM academic_workload.academic_load`
      );
      progress.deleted.academic_load = delLoad.rowCount ?? 0;

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
      console.log("Deleted:", progress.deleted);
    }

    const docs = assignments.map((a) =>
      normDoc(a.person_document || a.teacher?.document)
    );
    console.log("Precargando personas...");
    const personMap = await preloadPersons(client, personTable, docs);
    console.log(`Personas resueltas: ${personMap.size} / ${new Set(docs.filter(Boolean)).size}`);

    for (let i = 0; i < assignments.length; i++) {
      const a = assignments[i];
      progress.totals.processed = i + 1;
      const doc = normDoc(a.person_document || a.teacher?.document);
      const period = String(a.period_code || a.academic_load?.period_code || "");
      progress.by_period[period] ??= { ok: 0, skipped: 0, errors: 0 };

      try {
        if (!doc) {
          progress.totals.skipped_missing_person += 1;
          progress.by_period[period].skipped += 1;
          progress.skipped_missing_person.push({
            index: i,
            reason: "documento_vacio",
            period,
            subject: a.subject?.subject_code,
            group: a.class_group?.group_code,
          });
          continue;
        }

        const personId = personMap.get(doc);
        if (!personId) {
          progress.totals.skipped_missing_person += 1;
          progress.by_period[period].skipped += 1;
          if (progress.skipped_missing_person.length < 500) {
            progress.skipped_missing_person.push({
              index: i,
              document: doc,
              name: a.teacher?.name ?? null,
              period,
              subject: a.subject?.subject_code,
              group: a.class_group?.group_code,
            });
          }
          continue;
        }

        const subjectCode = String(a.subject?.subject_code || "").trim();
        const groupCode = String(a.class_group?.group_code || "").trim();
        if (!subjectCode || !groupCode || !period) {
          progress.totals.errors += 1;
          progress.by_period[period || "?"].errors += 1;
          progress.errors.push({
            index: i,
            document: doc,
            error: "faltan subject/group/period",
          });
          continue;
        }

        if (!DRY_RUN) {
          const s = await upsertSubject(client, {
            subjectCode,
            name: a.subject?.name || subjectCode,
            creditsQuantity:
              a.subject?.credits_quantity == null
                ? null
                : Number(a.subject.credits_quantity),
          });
          if (s.isNew) progress.upserts.subject_new += 1;
          else progress.upserts.subject_existing += 1;

          const g = await upsertClassGroup(client, {
            subjectCode,
            groupCode,
            startDate: parseDateDMY(a.class_group?.start_date),
            endDate: parseDateDMY(a.class_group?.end_date),
            classroomName: a.class_group?.classroom ?? null,
            capacity:
              a.class_group?.capacity == null
                ? null
                : Number(a.class_group.capacity),
            block: a.class_group?.block ?? null,
            scheduleTime: scheduleText(a.class_group),
            modality: a.class_group?.modality ?? null,
          });
          if (g.isNew) progress.upserts.class_group_new += 1;
          else progress.upserts.class_group_existing += 1;

          const al = await upsertAcademicLoad(client, {
            personId,
            periodCode: period,
            semester: a.academic_load?.semester ?? null,
            programName: a.academic_load?.program_name ?? null,
            subjectCode,
            groupCode,
            enrolledQuantity:
              a.class_group?.enrolled_quantity == null
                ? null
                : Number(a.class_group.enrolled_quantity),
            substantiveHoursQuantity: a.subject?.hours_quantity ?? 0,
          });
          if (al.isNew) progress.upserts.academic_load_new += 1;
          else progress.upserts.academic_load_existing += 1;
        }

        progress.totals.ok += 1;
        progress.by_period[period].ok += 1;
      } catch (err) {
        progress.totals.errors += 1;
        progress.by_period[period || "?"] ??= { ok: 0, skipped: 0, errors: 0 };
        progress.by_period[period || "?"].errors += 1;
        progress.errors.push({
          index: i,
          document: doc,
          period,
          subject: a.subject?.subject_code,
          group: a.class_group?.group_code,
          error: String(err?.message || err),
        });
      }

      if ((i + 1) % 100 === 0 || i === assignments.length - 1) {
        writeProgress(progress);
        console.log(
          `Progreso ${i + 1}/${assignments.length} | ok=${progress.totals.ok} skip=${progress.totals.skipped_missing_person} err=${progress.totals.errors}`
        );
      }
    }

    const after = await client.query(`
      SELECT
        (SELECT COUNT(1)::int FROM academic_workload.academic_load) AS academic_load,
        (SELECT COUNT(1)::int FROM academic_workload.class_group) AS class_group,
        (SELECT COUNT(1)::int FROM academic_workload.subject) AS subject
    `);
    progress.counts_after = after.rows[0];
    progress.finished_at = new Date().toISOString();
    writeProgress(progress);

    console.log("=".repeat(60));
    console.log("DONE");
    console.log("Deleted:", progress.deleted);
    console.log("Totals:", progress.totals);
    console.log("Upserts:", progress.upserts);
    console.log("Counts after:", progress.counts_after);
    console.log("Progress JSON:", PROGRESS_PATH);
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
