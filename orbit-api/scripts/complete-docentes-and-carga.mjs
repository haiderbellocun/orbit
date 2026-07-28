/**
 * Completa al 100% el match BASE docente + carga academica:
 * 1) Crea en core.person los NUEVOS (y omitidos de carga) que faltan
 * 2) Reimporta solo las asignaciones previamente omitidas
 * 3) Escribe JSON de progreso/resultados
 *
 * Uso (desde orbit-api):
 *   node scripts/complete-docentes-and-carga.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const BASE_XLSX = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY",
  "BASE DOCENTE SOLICITUD CORREOS REINTEGROS - NUEVOS PERIODO 2026C - PARTE 1.xlsx"
);
const CARGA_JSON = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY/descargas_carga_academica",
  "carga_academica__2026Q_26C11_26E03_26ES4_26ET2_26I33_26P04_26PI4_26T04_26V04__20260727_113642.json"
);
const SKIP_JSON = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY/descargas_carga_academica",
  "import_carga_academica__progress__20260727_145216.json"
);
const OUT_DIR = path.resolve(
  "C:/Dev/Pruebas/ACA'S SCRAPPY/descargas_carga_academica"
);

const ROLE_ID = 2;
const HIERARCHY_ID = 5;
const VW50 = 50;
const VW100 = 100;
const VW150 = 150;
const VW250 = 250;

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function resolveSsl() {
  const explicit = String(process.env.DB_SSL ?? "").trim().toLowerCase();
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

function normDoc(v) {
  return String(v ?? "").replace(/[^\d]/g, "");
}
function normEmail(v) {
  const e = String(v ?? "").trim().toLowerCase();
  return e && e.includes("@") ? e : null;
}
function normHeader(h) {
  return String(h ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}
function truncateUtf(value, max) {
  if (value == null) return null;
  const s = String(value);
  if ([...s].length <= max) return s;
  return [...s].slice(0, max).join("");
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

function readBasePeople(workbook) {
  const out = [];
  for (const [sheetName, tipo] of [
    ["REINTEGROS", "REINTEGRO"],
    ["NUEVOS", "NUEVO"],
  ]) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    if (!matrix.length) continue;
    const header = (matrix[0] || []).map(normHeader);
    const idx = (...cands) => {
      for (const c of cands) {
        const i = header.findIndex((h) => h === c || h.includes(c));
        if (i >= 0) return i;
      }
      return -1;
    };
    const iDoc = idx("identificacion", "documento");
    const iNom = idx("nombres");
    const iApe = idx("apellidos");
    const iCorp = idx(
      "correo corportaivo",
      "correo corporativo",
      "correo institucional"
    );
    const iPers = idx("correo personal");
    const get = (row, i) => (i >= 0 && i < row.length ? row[i] : "");

    for (let r = 1; r < matrix.length; r++) {
      const row = matrix[r];
      const document = normDoc(get(row, iDoc));
      const nombres = String(get(row, iNom) ?? "").trim();
      const apellidos = String(get(row, iApe) ?? "").trim();
      if (!document) continue;
      const corp = normEmail(get(row, iCorp));
      const pers = normEmail(get(row, iPers));
      out.push({
        source: "BASE",
        tipo,
        document,
        full_name: `${nombres} ${apellidos}`.trim() || document,
        edu_email: corp && corp.endsWith("@cun.edu.co") ? corp : null,
        email: pers || (corp && !corp.endsWith("@cun.edu.co") ? corp : null),
      });
    }
  }
  return out;
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

async function emailTaken(client, email, exceptDoc = null) {
  if (!email) return false;
  const r = await client.query(
    `SELECT id, document FROM core.person
     WHERE lower(trim(COALESCE(edu_email,''))) = $1
        OR lower(trim(COALESCE(email,''))) = $1
     LIMIT 1`,
    [email]
  );
  if (!r.rows.length) return false;
  if (exceptDoc && normDoc(r.rows[0].document) === exceptDoc) return false;
  return true;
}

async function findPersonByDoc(client, doc) {
  const r = await client.query(
    `SELECT id, document, full_name, edu_email, email, role_id, role_eval
     FROM core.person
     WHERE regexp_replace(COALESCE(document::text,''), '[^0-9]', '', 'g') = $1
     LIMIT 1`,
    [doc]
  );
  return r.rows[0] || null;
}

async function createOrEnsurePerson(client, p, progress) {
  const doc = normDoc(p.document);
  if (!doc) {
    progress.person.errors.push({ ...p, error: "documento_vacio" });
    return null;
  }

  let edu = p.edu_email;
  let email = p.email;
  if (edu && (await emailTaken(client, edu, doc))) {
    progress.person.email_conflicts.push({ document: doc, email: edu, field: "edu_email" });
    edu = null;
  }
  if (email && (await emailTaken(client, email, doc))) {
    progress.person.email_conflicts.push({ document: doc, email, field: "email" });
    email = null;
  }

  const existing = await findPersonByDoc(client, doc);
  if (existing) {
    await client.query(
      `UPDATE core.person SET
         full_name = COALESCE(NULLIF($1,''), full_name),
         edu_email = COALESCE(edu_email, $2),
         email = COALESCE(email, $3),
         role_id = COALESCE(role_id, $4),
         role_eval = COALESCE(NULLIF(role_eval,''), 'DOCENTE'),
         hierarchy_id = COALESCE(hierarchy_id, $5),
         is_active = COALESCE(is_active, true),
         updated_at = NOW()
       WHERE id = $6`,
      [p.full_name, edu, email, ROLE_ID, HIERARCHY_ID, existing.id]
    );
    progress.person.already_existed += 1;
    progress.person.updated += 1;
    return existing.id;
  }

  const inserted = await client.query(
    `INSERT INTO core.person (
      document, full_name, edu_email, email,
      role_id, role_eval, hierarchy_id, is_active
    ) VALUES ($1,$2,$3,$4,$5,'DOCENTE',$6,true)
    RETURNING id`,
    [doc, p.full_name || doc, edu, email, ROLE_ID, HIERARCHY_ID]
  );
  progress.person.created += 1;
  progress.person.created_docs.push({
    document: doc,
    full_name: p.full_name,
    source: p.source,
    tipo: p.tipo || null,
    person_id: inserted.rows[0].id,
  });
  return inserted.rows[0].id;
}

async function main() {
  const progress = {
    started_at: new Date().toISOString(),
    finished_at: null,
    sources: { base: BASE_XLSX, carga: CARGA_JSON, skip: SKIP_JSON },
    person: {
      created: 0,
      already_existed: 0,
      updated: 0,
      created_docs: [],
      email_conflicts: [],
      errors: [],
    },
    carga: {
      target_assignments: 0,
      ok: 0,
      still_missing_person: 0,
      errors: 0,
      still_missing: [],
      error_rows: [],
      upserts: {
        subject_new: 0,
        subject_existing: 0,
        class_group_new: 0,
        class_group_existing: 0,
        academic_load_new: 0,
        academic_load_existing: 0,
      },
    },
    verification: {},
  };

  const outPath = path.join(
    OUT_DIR,
    `complete_docentes_carga__progress__${stamp()}.json`
  );
  const write = () => {
    progress.updated_at = new Date().toISOString();
    fs.writeFileSync(outPath, JSON.stringify(progress, null, 2), "utf8");
  };

  const wb = XLSX.readFile(BASE_XLSX);
  const basePeople = readBasePeople(wb);
  const byDoc = new Map();
  for (const p of basePeople) {
    if (!byDoc.has(p.document)) byDoc.set(p.document, p);
  }

  const skipPayload = JSON.parse(fs.readFileSync(SKIP_JSON, "utf8"));
  const cargaPayload = JSON.parse(fs.readFileSync(CARGA_JSON, "utf8"));
  const skipDocs = new Set(
    (skipPayload.skipped_missing_person || [])
      .map((s) => normDoc(s.document))
      .filter(Boolean)
  );

  // Candidates to create: all BASE people not yet in DB + omitidos de carga no en BASE
  const toEnsure = [...byDoc.values()];

  // From carga for skip docs not in BASE
  const cargaTeacherByDoc = new Map();
  for (const a of cargaPayload.assignments || []) {
    const doc = normDoc(a.person_document || a.teacher?.document);
    if (!doc || !skipDocs.has(doc)) continue;
    if (!cargaTeacherByDoc.has(doc)) {
      cargaTeacherByDoc.set(doc, {
        source: "CARGA_ACADEMICA",
        tipo: "OMITIDO_CARGA",
        document: doc,
        full_name: a.teacher?.name || doc,
        edu_email:
          normEmail(a.teacher?.email)?.endsWith("@cun.edu.co")
            ? normEmail(a.teacher.email)
            : null,
        email: normEmail(a.teacher?.email) || null,
      });
    }
  }
  for (const [doc, p] of cargaTeacherByDoc) {
    if (!byDoc.has(doc)) toEnsure.push(p);
  }

  console.log(`BASE people: ${byDoc.size}`);
  console.log(`Skip docs: ${skipDocs.size}`);
  console.log(`To ensure in person: ${toEnsure.length}`);
  console.log(`Progress: ${outPath}`);

  const client = await pool.connect();
  try {
    // Validate role/hierarchy exist
    const roleOk = await client.query(`SELECT id FROM core.role WHERE id = $1`, [
      ROLE_ID,
    ]);
    if (!roleOk.rows.length) throw new Error(`role_id=${ROLE_ID} no existe`);
    const hierOk = await client.query(
      `SELECT id FROM core.hierarchy WHERE id = $1`,
      [HIERARCHY_ID]
    );
    if (!hierOk.rows.length) {
      console.warn(`hierarchy_id=${HIERARCHY_ID} no existe; se inserta sin hierarchy`);
    }

    console.log("=== FASE 1: crear/asegurar personas ===");
    for (const p of toEnsure) {
      try {
        // if hierarchy missing, temporarily null
        if (!hierOk.rows.length) {
          const doc = normDoc(p.document);
          const existing = await findPersonByDoc(client, doc);
          if (existing) {
            progress.person.already_existed += 1;
            continue;
          }
          let edu = p.edu_email;
          let email = p.email;
          if (edu && (await emailTaken(client, edu, doc))) edu = null;
          if (email && (await emailTaken(client, email, doc))) email = null;
          const inserted = await client.query(
            `INSERT INTO core.person (
              document, full_name, edu_email, email,
              role_id, role_eval, is_active
            ) VALUES ($1,$2,$3,$4,$5,'DOCENTE',true)
            RETURNING id`,
            [doc, p.full_name || doc, edu, email, ROLE_ID]
          );
          progress.person.created += 1;
          progress.person.created_docs.push({
            document: doc,
            full_name: p.full_name,
            source: p.source,
            tipo: p.tipo || null,
            person_id: inserted.rows[0].id,
          });
        } else {
          await createOrEnsurePerson(client, p, progress);
        }
      } catch (err) {
        progress.person.errors.push({
          document: p.document,
          full_name: p.full_name,
          error: String(err?.message || err),
        });
      }
      if (
        (progress.person.created + progress.person.already_existed) % 50 === 0
      ) {
        write();
      }
    }
    write();
    console.log("Person:", {
      created: progress.person.created,
      existed: progress.person.already_existed,
      updated: progress.person.updated,
      errors: progress.person.errors.length,
      email_conflicts: progress.person.email_conflicts.length,
    });

    console.log("=== FASE 2: reimportar asignaciones omitidas ===");
    // Build person map for skip docs
    const personMap = new Map();
    const docsArr = [...skipDocs];
    if (docsArr.length) {
      const r = await client.query(
        `SELECT id,
                regexp_replace(COALESCE(document::text,''), '[^0-9]', '', 'g') AS doc_digits
         FROM core.person
         WHERE regexp_replace(COALESCE(document::text,''), '[^0-9]', '', 'g') = ANY($1::text[])`,
        [docsArr]
      );
      for (const row of r.rows) personMap.set(row.doc_digits, row.id);
    }

    const targets = (cargaPayload.assignments || []).filter((a) =>
      skipDocs.has(normDoc(a.person_document || a.teacher?.document))
    );
    progress.carga.target_assignments = targets.length;
    console.log(`Asignaciones a reimportar: ${targets.length}`);

    for (let i = 0; i < targets.length; i++) {
      const a = targets[i];
      const doc = normDoc(a.person_document || a.teacher?.document);
      const personId = personMap.get(doc);
      const period = String(a.period_code || a.academic_load?.period_code || "");
      try {
        if (!personId) {
          progress.carga.still_missing_person += 1;
          progress.carga.still_missing.push({
            document: doc,
            name: a.teacher?.name,
            period,
            subject: a.subject?.subject_code,
            group: a.class_group?.group_code,
          });
          continue;
        }
        const subjectCode = String(a.subject?.subject_code || "").trim();
        const groupCode = String(a.class_group?.group_code || "").trim();
        if (!subjectCode || !groupCode || !period) {
          progress.carga.errors += 1;
          progress.carga.error_rows.push({
            document: doc,
            error: "faltan subject/group/period",
          });
          continue;
        }

        const s = await upsertSubject(client, {
          subjectCode,
          name: a.subject?.name || subjectCode,
          creditsQuantity:
            a.subject?.credits_quantity == null
              ? null
              : Number(a.subject.credits_quantity),
        });
        if (s.isNew) progress.carga.upserts.subject_new += 1;
        else progress.carga.upserts.subject_existing += 1;

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
        if (g.isNew) progress.carga.upserts.class_group_new += 1;
        else progress.carga.upserts.class_group_existing += 1;

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
        if (al.isNew) progress.carga.upserts.academic_load_new += 1;
        else progress.carga.upserts.academic_load_existing += 1;

        progress.carga.ok += 1;
      } catch (err) {
        progress.carga.errors += 1;
        progress.carga.error_rows.push({
          document: doc,
          period,
          error: String(err?.message || err),
        });
      }
      if ((i + 1) % 25 === 0 || i === targets.length - 1) {
        write();
        console.log(
          `Carga ${i + 1}/${targets.length} ok=${progress.carga.ok} miss=${progress.carga.still_missing_person} err=${progress.carga.errors}`
        );
      }
    }

    console.log("=== FASE 3: verificacion ===");
    // BASE docs in person?
    const baseDocs = [...byDoc.keys()];
    const baseInPerson = await client.query(
      `SELECT COUNT(DISTINCT regexp_replace(COALESCE(document::text,''), '[^0-9]', '', 'g'))::int AS n
       FROM core.person
       WHERE regexp_replace(COALESCE(document::text,''), '[^0-9]', '', 'g') = ANY($1::text[])`,
      [baseDocs]
    );
    const skipInPerson = await client.query(
      `SELECT COUNT(DISTINCT regexp_replace(COALESCE(document::text,''), '[^0-9]', '', 'g'))::int AS n
       FROM core.person
       WHERE regexp_replace(COALESCE(document::text,''), '[^0-9]', '', 'g') = ANY($1::text[])`,
      [docsArr]
    );
    const loadCount = await client.query(
      `SELECT COUNT(1)::int AS n FROM academic_workload.academic_load`
    );
    const missingBase = [];
    for (const doc of baseDocs) {
      const exists = await findPersonByDoc(client, doc);
      if (!exists) missingBase.push(doc);
    }
    const missingSkip = [];
    for (const doc of docsArr) {
      const exists = await findPersonByDoc(client, doc);
      if (!exists) missingSkip.push(doc);
    }

    progress.verification = {
      base_total: baseDocs.length,
      base_in_person: baseInPerson.rows[0].n,
      base_missing: missingBase.length,
      base_missing_docs: missingBase,
      skip_total: docsArr.length,
      skip_in_person: skipInPerson.rows[0].n,
      skip_missing: missingSkip.length,
      skip_missing_docs: missingSkip,
      academic_load_total: loadCount.rows[0].n,
      carga_reimport_ok: progress.carga.ok,
      carga_reimport_target: progress.carga.target_assignments,
      pct_base_in_person:
        baseDocs.length === 0
          ? 100
          : Math.round((baseInPerson.rows[0].n / baseDocs.length) * 10000) / 100,
      pct_skip_in_person:
        docsArr.length === 0
          ? 100
          : Math.round((skipInPerson.rows[0].n / docsArr.length) * 10000) / 100,
      pct_carga_reimport:
        progress.carga.target_assignments === 0
          ? 100
          : Math.round(
              (progress.carga.ok / progress.carga.target_assignments) * 10000
            ) / 100,
    };

    progress.finished_at = new Date().toISOString();
    write();

    console.log("=".repeat(60));
    console.log("DONE");
    console.log("Person created:", progress.person.created);
    console.log("Carga reimport:", progress.carga);
    console.log("Verification:", progress.verification);
    console.log("Progress JSON:", outPath);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {}
  process.exit(1);
});
