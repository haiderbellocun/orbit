/**
 * Purga snapshots/corridas más antiguos que la retención (default 24 meses).
 * No elimina snapshot_type='recovery'. Conserva el último OK por cada period_code
 * presente en period_codes del run.
 *
 * Uso:
 *   node scripts/purge-academic-load-snapshots.mjs --months 24 --dry-run
 *   node scripts/purge-academic-load-snapshots.mjs --months 24
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const args = process.argv.slice(2);
function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

const MONTHS = Number.parseInt(argValue("--months") || "24", 10);
const DRY_RUN = args.includes("--dry-run");

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
  const client = await pool.connect();
  try {
    const candidates = await client.query(
      `
      WITH last_per_period AS (
        SELECT DISTINCT ON (p.period_code) r.id AS run_id
        FROM academic_workload.import_run r
        CROSS JOIN LATERAL unnest(COALESCE(r.period_codes, ARRAY[]::text[])) AS p(period_code)
        WHERE r.status = 'ok'
        ORDER BY p.period_code, r.imported_at DESC
      ),
      keep_ids AS (
        SELECT run_id AS id FROM last_per_period
        UNION
        SELECT id FROM academic_workload.import_run WHERE snapshot_type = 'recovery'
      )
      SELECT r.id, r.imported_at, r.fecha_carga, r.snapshot_type, r.is_official, r.status, r.row_count
      FROM academic_workload.import_run r
      WHERE r.imported_at < (now() - ($1::text || ' months')::interval)
        AND r.id NOT IN (SELECT id FROM keep_ids)
      ORDER BY r.imported_at
      `,
      [String(MONTHS)]
    );

    console.log(
      `Candidatos a purga (>${MONTHS} meses, excl. recovery y último OK/periodo): ${candidates.rowCount}`
    );
    for (const row of candidates.rows.slice(0, 20)) {
      console.log(
        `  id=${row.id} fecha=${row.fecha_carga} type=${row.snapshot_type} rows=${row.row_count}`
      );
    }
    if (candidates.rowCount > 20) console.log(`  ... +${candidates.rowCount - 20} más`);

    if (DRY_RUN || candidates.rowCount === 0) {
      console.log(DRY_RUN ? "DRY-RUN: sin cambios" : "Nada que purgar");
      return;
    }

    await client.query("BEGIN");
    try {
      const ids = candidates.rows.map((r) => r.id);
      const delSnap = await client.query(
        `DELETE FROM academic_workload.academic_load_snapshot WHERE import_run_id = ANY($1::bigint[])`,
        [ids]
      );
      const delRun = await client.query(
        `DELETE FROM academic_workload.import_run WHERE id = ANY($1::bigint[])`,
        [ids]
      );
      await client.query("COMMIT");
      console.log(
        JSON.stringify(
          {
            purged_runs: delRun.rowCount,
            purged_snapshot_rows: delSnap.rowCount,
            months: MONTHS,
          },
          null,
          2
        )
      );
    } catch (err) {
      await client.query("ROLLBACK");
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
