/**
 * Helpers para bitácora / snapshot / delta de carga académica.
 */
import crypto from "crypto";
import fs from "fs";

export const HISTORY_APP_VERSION = "academic-load-history/1.0.0";
export const CIRCUIT_BREAKER_RATIO = 0.3;

/** Clave de negocio + valores → SHA-256 Buffer (bytea). */
export function computeRowHash(row) {
  const parts = [
    String(row.period_code ?? ""),
    String(row.subject_code ?? ""),
    String(row.group_code ?? ""),
    String(row.person_id ?? ""),
    String(row.aca_group_id ?? ""),
    String(row.semester ?? ""),
    String(row.program_id ?? ""),
    String(row.program_name ?? ""),
    String(row.enrolled_quantity ?? ""),
    String(row.substantive_hours_quantity ?? ""),
    String(row.region_id ?? ""),
    String(row.city_id ?? ""),
    String(row.campus_id ?? ""),
    String(row.class_preparation_id ?? ""),
  ];
  return crypto.createHash("sha256").update(parts.join("|"), "utf8").digest();
}

export function computeContentHashFromFile(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function computeContentHashFromRows(rows) {
  const canonical = [...rows]
    .map((r) =>
      [
        r.periodCode,
        r.subjectCode,
        r.groupCode,
        r.personId,
        r.acaGroupId ?? "",
        r.enrolledQuantity ?? "",
        r.subjectHours ?? "",
      ].join("|")
    )
    .sort();
  return crypto
    .createHash("sha256")
    .update(canonical.join("\n"), "utf8")
    .digest("hex");
}

export async function insertImportRun(client, input) {
  const r = await client.query(
    `INSERT INTO academic_workload.import_run (
       snapshot_type, is_official, source_file, source_file_size,
       content_hash, period_codes, status, imported_by, app_version
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, imported_at, fecha_carga`,
    [
      input.snapshotType,
      input.isOfficial,
      input.sourceFile,
      input.sourceFileSize,
      input.contentHash,
      input.periodCodes ?? null,
      input.status ?? "running",
      input.importedBy ?? null,
      input.appVersion ?? HISTORY_APP_VERSION,
    ]
  );
  return r.rows[0];
}

export async function failImportRun(client, runId, errorMessage, durationMs) {
  await client.query(
    `UPDATE academic_workload.import_run
     SET status = 'failed',
         error_message = $2,
         duration_ms = $3
     WHERE id = $1`,
    [runId, String(errorMessage ?? "").slice(0, 4000), durationMs ?? null]
  );
}

export async function completeImportRun(client, runId, metrics) {
  await client.query(
    `UPDATE academic_workload.import_run
     SET status = $2,
         has_changes = $3,
         row_count = $4,
         added = $5,
         removed = $6,
         changed = $7,
         duration_ms = $8,
         error_message = NULL
     WHERE id = $1`,
    [
      runId,
      metrics.status ?? "ok",
      metrics.hasChanges,
      metrics.rowCount,
      metrics.added,
      metrics.removed,
      metrics.changed,
      metrics.durationMs,
    ]
  );
}

export async function getLastOkRun(client) {
  const r = await client.query(
    `SELECT id, content_hash, row_count, imported_at
     FROM academic_workload.import_run
     WHERE status = 'ok'
     ORDER BY imported_at DESC
     LIMIT 1`
  );
  return r.rows[0] ?? null;
}

/**
 * Circuit breaker: rechaza si el volumen nuevo difiere > ratio del último OK.
 */
export function checkCircuitBreaker(
  newCount,
  lastOkCount,
  ratio = CIRCUIT_BREAKER_RATIO
) {
  if (lastOkCount == null || lastOkCount <= 0) {
    return { ok: true, ratio: null };
  }
  const delta = Math.abs(newCount - lastOkCount) / lastOkCount;
  return {
    ok: delta <= ratio,
    ratio: delta,
    lastOkCount,
    newCount,
    threshold: ratio,
  };
}

export async function truncateStaging(client) {
  await client.query(`TRUNCATE academic_workload.academic_load_stg`);
}

/**
 * Inserta filas en staging (chunks).
 * Campos esperados en camelCase (ver importador).
 */
export async function insertStagingRows(client, rows, chunkSize = 200) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const placeholders = [];
    const params = [];
    let p = 1;
    for (const row of chunk) {
      const hash = computeRowHash({
        period_code: row.periodCode,
        subject_code: row.subjectCode,
        group_code: row.groupCode,
        person_id: row.personId,
        aca_group_id: row.acaGroupId,
        semester: row.semester,
        program_id: row.programId,
        program_name: row.programName,
        enrolled_quantity: row.enrolledQuantity ?? 0,
        substantive_hours_quantity: row.substantiveHoursQuantity ?? 0,
        region_id: row.regionId,
        city_id: row.cityId,
        campus_id: row.campusId,
        class_preparation_id: row.classPreparationId,
      });
      placeholders.push(
        `($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`
      );
      params.push(
        row.personId,
        row.periodCode,
        row.semester ?? null,
        row.programId ?? null,
        row.programName ?? null,
        row.subjectCode,
        row.groupCode,
        row.acaGroupId ?? null,
        row.enrolledQuantity ?? 0,
        row.regionId ?? null,
        row.cityId ?? null,
        row.campusId ?? null,
        row.substantiveCategoryId ?? null,
        row.substantiveHoursQuantity ?? 0,
        row.classPreparationId ?? null,
        row.teacherFullName ?? null,
        row.subjectName ?? null,
        row.regionName ?? null,
        row.cityName ?? null,
        row.campusName ?? null,
        hash
      );
    }
    await client.query(
      `INSERT INTO academic_workload.academic_load_stg (
         person_id, period_code, semester, program_id, program_name,
         subject_code, group_code, aca_group_id, enrolled_quantity,
         region_id, city_id, campus_id, substantive_category_id,
         substantive_hours_quantity, class_preparation_id,
         teacher_full_name, subject_name, region_name, city_name, campus_name,
         row_hash
       ) VALUES ${placeholders.join(",")}`,
      params
    );
  }
}

/** Completa nombres desnormalizados en staging vía catálogos vigentes. */
export async function enrichStagingNames(client, personTable) {
  await client.query(`
    UPDATE academic_workload.academic_load_stg stg
    SET teacher_full_name = COALESCE(stg.teacher_full_name, p.full_name)
    FROM ${personTable} p
    WHERE p.id = stg.person_id
  `);
  await client.query(`
    UPDATE academic_workload.academic_load_stg stg
    SET subject_name = COALESCE(stg.subject_name, s.name)
    FROM academic_workload.subject s
    WHERE s.subject_code = stg.subject_code
  `);
  await client.query(`
    UPDATE academic_workload.academic_load_stg stg
    SET region_name = COALESCE(stg.region_name, r.name)
    FROM core.region r
    WHERE r.id = stg.region_id
  `);
  await client.query(`
    UPDATE academic_workload.academic_load_stg stg
    SET city_name = COALESCE(stg.city_name, c.name)
    FROM core.city c
    WHERE c.id = stg.city_id
  `);
  await client.query(`
    UPDATE academic_workload.academic_load_stg stg
    SET campus_name = COALESCE(stg.campus_name, cam.name)
    FROM core.campus cam
    WHERE cam.id = stg.campus_id
  `);
}

/** Delta staging vs academic_load vigente (clave + columnas de valor). */
export async function computeDeltaMetrics(client) {
  const r = await client.query(`
    WITH keys_cur AS (
      SELECT
        period_code, subject_code, group_code, person_id,
        COALESCE(aca_group_id, '') AS aca_group_id
      FROM academic_workload.academic_load
    ),
    keys_stg AS (
      SELECT
        period_code, subject_code, group_code, person_id,
        COALESCE(aca_group_id, '') AS aca_group_id
      FROM academic_workload.academic_load_stg
    )
    SELECT
      (SELECT count(*)::int FROM keys_stg k
        WHERE NOT EXISTS (
          SELECT 1 FROM keys_cur c
          WHERE c.period_code = k.period_code
            AND c.subject_code = k.subject_code
            AND c.group_code = k.group_code
            AND c.person_id = k.person_id
            AND c.aca_group_id = k.aca_group_id
        )) AS added,
      (SELECT count(*)::int FROM keys_cur c
        WHERE NOT EXISTS (
          SELECT 1 FROM keys_stg k
          WHERE k.period_code = c.period_code
            AND k.subject_code = c.subject_code
            AND k.group_code = c.group_code
            AND k.person_id = c.person_id
            AND k.aca_group_id = c.aca_group_id
        )) AS removed,
      (SELECT count(*)::int
       FROM academic_workload.academic_load_stg s
       JOIN academic_workload.academic_load c
         ON c.period_code = s.period_code
        AND c.subject_code = s.subject_code
        AND c.group_code = s.group_code
        AND c.person_id = s.person_id
        AND COALESCE(c.aca_group_id, '') = COALESCE(s.aca_group_id, '')
       WHERE c.semester IS DISTINCT FROM s.semester
          OR c.program_id IS DISTINCT FROM s.program_id
          OR c.program_name IS DISTINCT FROM s.program_name
          OR c.enrolled_quantity IS DISTINCT FROM s.enrolled_quantity
          OR c.substantive_hours_quantity IS DISTINCT FROM s.substantive_hours_quantity
          OR c.region_id IS DISTINCT FROM s.region_id
          OR c.city_id IS DISTINCT FROM s.city_id
          OR c.campus_id IS DISTINCT FROM s.campus_id
          OR c.class_preparation_id IS DISTINCT FROM s.class_preparation_id
      ) AS changed
  `);
  const row = r.rows[0] ?? { added: 0, removed: 0, changed: 0 };
  return {
    added: Number(row.added) || 0,
    removed: Number(row.removed) || 0,
    changed: Number(row.changed) || 0,
  };
}

/**
 * Transacción: snapshot desde staging → replace academic_load → complete run.
 */
export async function commitStagingSwap(
  client,
  { runId, fechaCarga, metrics, durationMs }
) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL lock_timeout = '10s'`);
    await client.query(`SET LOCAL statement_timeout = '120s'`);

    await client.query(
      `INSERT INTO academic_workload.academic_load_snapshot (
         import_run_id, fecha_carga,
         person_id, teacher_full_name, subject_code, subject_name,
         group_code, aca_group_id, period_code, semester,
         program_id, program_name, enrolled_quantity, substantive_hours_quantity,
         region_id, region_name, city_id, city_name, campus_id, campus_name,
         class_preparation_id, row_hash
       )
       SELECT
         $1, $2,
         person_id, teacher_full_name, subject_code, subject_name,
         group_code, aca_group_id, period_code, semester,
         program_id, program_name, enrolled_quantity, substantive_hours_quantity,
         region_id, region_name, city_id, city_name, campus_id, campus_name,
         class_preparation_id, row_hash
       FROM academic_workload.academic_load_stg`,
      [runId, fechaCarga]
    );

    const del = await client.query(`DELETE FROM academic_workload.academic_load`);
    await client.query(`
      INSERT INTO academic_workload.academic_load (
        person_id, period_code, semester, program_id, program_name,
        subject_code, group_code, aca_group_id, enrolled_quantity,
        region_id, city_id, campus_id, substantive_category_id,
        substantive_hours_quantity, class_preparation_id
      )
      SELECT
        person_id, period_code, semester, program_id, program_name,
        subject_code, group_code, aca_group_id, enrolled_quantity,
        region_id, city_id, campus_id, substantive_category_id,
        substantive_hours_quantity, class_preparation_id
      FROM academic_workload.academic_load_stg
    `);

    await completeImportRun(client, runId, {
      status: "ok",
      hasChanges: metrics.hasChanges,
      rowCount: metrics.rowCount,
      added: metrics.added,
      removed: metrics.removed,
      changed: metrics.changed,
      durationMs,
    });

    await client.query("COMMIT");
    return { deleted: del.rowCount ?? 0 };
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  }
}
