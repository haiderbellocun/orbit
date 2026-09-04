/**
 * Restaura academic_load vigente desde un import_run histórico.
 * Crea un nuevo import_run tipo recovery + snapshot del estado restaurado.
 *
 * Uso:
 *   node scripts/restore-academic-load-from-run.mjs --run-id 12
 *   node scripts/restore-academic-load-from-run.mjs --run-id 12 --imported-by ops@cun.edu.co
 *   node scripts/restore-academic-load-from-run.mjs --run-id 12 --dry-run
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import {
  HISTORY_APP_VERSION,
  commitStagingSwap,
  computeDeltaMetrics,
  failImportRun,
  insertImportRun,
  truncateStaging,
} from "./lib/academicLoadHistory.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const RUN_ID = Number(argValue("--run-id"));
const DRY_RUN = args.includes("--dry-run");
const IMPORTED_BY =
  argValue("--imported-by") || process.env.IMPORT_IMPORTED_BY || "restore-script";

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

async function main() {
  if (!RUN_ID) throw new Error("Indica --run-id <id>");
  const startedMs = Date.now();
  const client = await pool.connect();
  try {
    const src = await client.query(
      `SELECT id, status, row_count, period_codes, fecha_carga, imported_at
       FROM academic_workload.import_run WHERE id = $1`,
      [RUN_ID]
    );
    if (!src.rows.length) throw new Error(`import_run ${RUN_ID} no existe`);
    if (src.rows[0].status !== "ok") {
      throw new Error(`Solo se puede restaurar un run status=ok (actual=${src.rows[0].status})`);
    }

    const snapCount = await client.query(
      `SELECT count(*)::int AS n FROM academic_workload.academic_load_snapshot WHERE import_run_id = $1`,
      [RUN_ID]
    );
    const n = snapCount.rows[0].n;
    console.log(`Origen run=${RUN_ID} filas_snapshot=${n}`);

    if (DRY_RUN) {
      console.log("DRY-RUN: no se modifica la base");
      return;
    }

    await truncateStaging(client);
    await client.query(
      `INSERT INTO academic_workload.academic_load_stg (
         person_id, period_code, semester, program_id, program_name,
         subject_code, group_code, aca_group_id, enrolled_quantity,
         region_id, city_id, campus_id, substantive_category_id,
         substantive_hours_quantity, class_preparation_id,
         teacher_full_name, subject_name, region_name, city_name, campus_name,
         row_hash
       )
       SELECT
         person_id::int, period_code, semester, program_id::int, program_name,
         subject_code, group_code, aca_group_id, COALESCE(enrolled_quantity, 0),
         region_id::int, city_id::int, campus_id::int, NULL,
         COALESCE(substantive_hours_quantity, 0), class_preparation_id::int,
         teacher_full_name, subject_name, region_name, city_name, campus_name,
         row_hash
       FROM academic_workload.academic_load_snapshot
       WHERE import_run_id = $1`,
      [RUN_ID]
    );

    // Asegurar subject/class_group para FKs de academic_load
    await client.query(`
      INSERT INTO academic_workload.subject (subject_code, name, credits_quantity, hours_quantity, is_active)
      SELECT DISTINCT stg.subject_code, COALESCE(stg.subject_name, stg.subject_code), 0, 0, true
      FROM academic_workload.academic_load_stg stg
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_workload.subject s WHERE s.subject_code = stg.subject_code
      )
    `);
    await client.query(`
      INSERT INTO academic_workload.class_group (subject_code, group_code, capacity)
      SELECT DISTINCT stg.subject_code, stg.group_code, 0
      FROM academic_workload.academic_load_stg stg
      WHERE NOT EXISTS (
        SELECT 1 FROM academic_workload.class_group cg
        WHERE cg.subject_code = stg.subject_code AND cg.group_code = stg.group_code
      )
    `);

    const delta = await computeDeltaMetrics(client);
    const periods = await client.query(
      `SELECT array_agg(DISTINCT period_code) AS codes FROM academic_workload.academic_load_stg`
    );

    const run = await insertImportRun(client, {
      snapshotType: "recovery",
      isOfficial: false,
      sourceFile: `restore:from_run:${RUN_ID}`,
      sourceFileSize: null,
      contentHash: `restore-from-${RUN_ID}`,
      periodCodes: periods.rows[0].codes,
      status: "running",
      importedBy: IMPORTED_BY,
      appVersion: HISTORY_APP_VERSION,
    });

    try {
      const swap = await commitStagingSwap(client, {
        runId: run.id,
        fechaCarga: run.fecha_carga,
        metrics: {
          hasChanges: delta.added + delta.removed + delta.changed > 0,
          rowCount: n,
          added: delta.added,
          removed: delta.removed,
          changed: delta.changed,
        },
        durationMs: Date.now() - startedMs,
      });
      console.log(
        JSON.stringify(
          {
            restored_from: RUN_ID,
            new_run_id: run.id,
            deleted: swap.deleted,
            inserted: n,
            delta,
          },
          null,
          2
        )
      );
    } catch (err) {
      await failImportRun(client, run.id, err.message, Date.now() - startedMs);
      throw err;
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
