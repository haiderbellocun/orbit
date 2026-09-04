/**
 * Aceptación §16 (sin reemplazar academic_load vigente).
 *
 * Uso: node scripts/test-academic-load-history-acceptance.mjs
 */
import assert from "assert";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import {
  checkCircuitBreaker,
  computeRowHash,
  insertImportRun,
  failImportRun,
  completeImportRun,
} from "./lib/academicLoadHistory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

function resolveSsl() {
  const explicit = String(process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return undefined;
  if (explicit === "true" || explicit === "1") {
    return { rejectUnauthorized: false };
  }
  const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME,
  ssl: resolveSsl(),
});

async function cleanup(client, runIds) {
  if (!runIds.length) return;
  await client.query(
    `DELETE FROM academic_workload.academic_load_snapshot WHERE import_run_id = ANY($1::bigint[])`,
    [runIds]
  );
  await client.query(
    `DELETE FROM academic_workload.import_run WHERE id = ANY($1::bigint[])`,
    [runIds]
  );
}

async function main() {
  const client = await pool.connect();
  const created = [];
  try {
    // 1) DDL objects
    const objs = await client.query(`
      SELECT
        to_regclass('academic_workload.import_run') AS import_run,
        to_regclass('academic_workload.academic_load_snapshot') AS snapshot,
        to_regclass('academic_workload.academic_load_stg') AS stg,
        (SELECT count(*) FROM pg_proc p
           JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'academic_workload' AND p.proname = 'f_run_as_of') AS fn
    `);
    assert.ok(objs.rows[0].import_run, "falta import_run");
    assert.ok(objs.rows[0].snapshot, "falta snapshot");
    assert.ok(objs.rows[0].stg, "falta stg");
    assert.strictEqual(Number(objs.rows[0].fn), 1, "falta f_run_as_of");

    // 2) Circuit breaker (unit)
    assert.strictEqual(checkCircuitBreaker(50, 100).ok, false);

    // 3) Two adhoc runs + snapshots; compare delta
    const runA = await insertImportRun(client, {
      snapshotType: "adhoc",
      isOfficial: false,
      sourceFile: "acceptance-a",
      sourceFileSize: 1,
      contentHash: "hash-a",
      periodCodes: ["26TEST"],
      status: "running",
      importedBy: "acceptance",
    });
    created.push(runA.id);
    await completeImportRun(client, runA.id, {
      status: "ok",
      hasChanges: true,
      rowCount: 2,
      added: 2,
      removed: 0,
      changed: 0,
      durationMs: 1,
    });

    const hash1 = computeRowHash({
      period_code: "26TEST",
      subject_code: "SUB1",
      group_code: "G1",
      person_id: 1,
      aca_group_id: null,
      enrolled_quantity: 10,
      substantive_hours_quantity: 2,
    });
    const hash2 = computeRowHash({
      period_code: "26TEST",
      subject_code: "SUB2",
      group_code: "G2",
      person_id: 2,
      aca_group_id: "X",
      enrolled_quantity: 5,
      substantive_hours_quantity: 3,
    });

    await client.query(
      `INSERT INTO academic_workload.academic_load_snapshot (
         import_run_id, fecha_carga, person_id, teacher_full_name,
         subject_code, subject_name, group_code, aca_group_id, period_code,
         enrolled_quantity, substantive_hours_quantity, row_hash
       ) VALUES
         ($1, $2, 1, 'Doc A', 'SUB1', 'Materia 1', 'G1', NULL, '26TEST', 10, 2, $3),
         ($1, $2, 2, 'Doc B', 'SUB2', 'Materia 2', 'G2', 'X', '26TEST', 5, 3, $4)`,
      [runA.id, runA.fecha_carga, hash1, hash2]
    );

    const runB = await insertImportRun(client, {
      snapshotType: "adhoc",
      isOfficial: false,
      sourceFile: "acceptance-b",
      sourceFileSize: 1,
      contentHash: "hash-b",
      periodCodes: ["26TEST"],
      status: "running",
      importedBy: "acceptance",
    });
    created.push(runB.id);
    await completeImportRun(client, runB.id, {
      status: "ok",
      hasChanges: true,
      rowCount: 2,
      added: 1,
      removed: 1,
      changed: 1,
      durationMs: 1,
    });

    const hash2b = computeRowHash({
      period_code: "26TEST",
      subject_code: "SUB2",
      group_code: "G2",
      person_id: 2,
      aca_group_id: "X",
      enrolled_quantity: 8,
      substantive_hours_quantity: 3,
    });
    const hash3 = computeRowHash({
      period_code: "26TEST",
      subject_code: "SUB3",
      group_code: "G3",
      person_id: 3,
      aca_group_id: null,
      enrolled_quantity: 1,
      substantive_hours_quantity: 1,
    });

    await client.query(
      `INSERT INTO academic_workload.academic_load_snapshot (
         import_run_id, fecha_carga, person_id, teacher_full_name,
         subject_code, subject_name, group_code, aca_group_id, period_code,
         enrolled_quantity, substantive_hours_quantity, row_hash
       ) VALUES
         ($1, $2, 2, 'Doc B', 'SUB2', 'Materia 2', 'G2', 'X', '26TEST', 8, 3, $3),
         ($1, $2, 3, 'Doc C', 'SUB3', 'Materia 3', 'G3', NULL, '26TEST', 1, 1, $4)`,
      [runB.id, runB.fecha_carga, hash2b, hash3]
    );

    const added = await client.query(
      `SELECT count(*)::int AS n FROM academic_workload.academic_load_snapshot t
       WHERE t.import_run_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM academic_workload.academic_load_snapshot f
           WHERE f.import_run_id = $1
             AND f.period_code = t.period_code
             AND f.subject_code = t.subject_code
             AND f.group_code = t.group_code
             AND f.person_id = t.person_id
             AND COALESCE(f.aca_group_id,'') = COALESCE(t.aca_group_id,'')
         )`,
      [runA.id, runB.id]
    );
    assert.strictEqual(added.rows[0].n, 1, "expected 1 added");

    const removed = await client.query(
      `SELECT count(*)::int AS n FROM academic_workload.academic_load_snapshot f
       WHERE f.import_run_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM academic_workload.academic_load_snapshot t
           WHERE t.import_run_id = $2
             AND t.period_code = f.period_code
             AND t.subject_code = f.subject_code
             AND t.group_code = f.group_code
             AND t.person_id = f.person_id
             AND COALESCE(t.aca_group_id,'') = COALESCE(f.aca_group_id,'')
         )`,
      [runA.id, runB.id]
    );
    assert.strictEqual(removed.rows[0].n, 1, "expected 1 removed");

    const changed = await client.query(
      `SELECT count(*)::int AS n
       FROM academic_workload.academic_load_snapshot t
       JOIN academic_workload.academic_load_snapshot f
         ON f.import_run_id = $1
        AND f.period_code = t.period_code
        AND f.subject_code = t.subject_code
        AND f.group_code = t.group_code
        AND f.person_id = t.person_id
        AND COALESCE(f.aca_group_id,'') = COALESCE(t.aca_group_id,'')
       WHERE t.import_run_id = $2
         AND f.row_hash IS DISTINCT FROM t.row_hash`,
      [runA.id, runB.id]
    );
    assert.strictEqual(changed.rows[0].n, 1, "expected 1 changed");

    // 4) Official uniqueness for a past day
    const pastA = await client.query(
      `INSERT INTO academic_workload.import_run (
         imported_at, snapshot_type, is_official, source_file, content_hash,
         status, row_count, imported_by, app_version
       ) VALUES (
         timestamptz '2020-06-15 22:00:00+00', 'daily_1700', true, 'acc-off-1', 'h1',
         'ok', 0, 'acceptance', 'test'
       ) RETURNING id, fecha_carga`
    );
    created.push(pastA.rows[0].id);
    const fechaStr =
      pastA.rows[0].fecha_carga instanceof Date
        ? pastA.rows[0].fecha_carga.toISOString().slice(0, 10)
        : String(pastA.rows[0].fecha_carga).slice(0, 10);
    assert.strictEqual(fechaStr, "2020-06-15");

    let uniqueOk = false;
    try {
      const pastB = await client.query(
        `INSERT INTO academic_workload.import_run (
           imported_at, snapshot_type, is_official, source_file, content_hash,
           status, row_count, imported_by, app_version
         ) VALUES (
           timestamptz '2020-06-15 23:00:00+00', 'daily_1700', true, 'acc-off-2', 'h2',
           'ok', 0, 'acceptance', 'test'
         ) RETURNING id`
      );
      created.push(pastB.rows[0].id);
    } catch (err) {
      uniqueOk = /uq_import_run_oficial_dia|unique/i.test(String(err.message));
    }
    assert.ok(uniqueOk, "expected unique official index to reject second ok");

    // Failed official same day allowed
    const pastFail = await insertImportRun(client, {
      snapshotType: "daily_1700",
      isOfficial: true,
      sourceFile: "acc-fail",
      sourceFileSize: 1,
      contentHash: "hf",
      periodCodes: ["26TEST"],
      status: "running",
      importedBy: "acceptance",
    });
    created.push(pastFail.id);
    await client.query(
      `UPDATE academic_workload.import_run
       SET imported_at = timestamptz '2020-06-15 21:00:00+00', status = 'failed', error_message = 'boom'
       WHERE id = $1`,
      [pastFail.id]
    );

    // 5) f_run_as_of finds the 2020 official cut
    const asOf = await client.query(
      `SELECT academic_workload.f_run_as_of(timestamptz '2020-06-15 23:30:00+00') AS id`
    );
    assert.strictEqual(Number(asOf.rows[0].id), Number(pastA.rows[0].id));

    // 6) failImportRun helper
    const runFail = await insertImportRun(client, {
      snapshotType: "adhoc",
      isOfficial: false,
      sourceFile: "acc-fail2",
      sourceFileSize: 1,
      contentHash: "hx",
      periodCodes: null,
      status: "running",
      importedBy: "acceptance",
    });
    created.push(runFail.id);
    await failImportRun(client, runFail.id, "simulated", 10);
    const st = await client.query(
      `SELECT status FROM academic_workload.import_run WHERE id = $1`,
      [runFail.id]
    );
    assert.strictEqual(st.rows[0].status, "failed");

    console.log("acceptance academic-load-history OK");
  } finally {
    try {
      await cleanup(client, created);
    } catch (err) {
      console.error("cleanup error", err);
    }
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
