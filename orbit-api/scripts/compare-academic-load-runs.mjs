/**
 * Compara dos cortes (import_run) y lista altas / bajas / cambios.
 *
 * Uso:
 *   node scripts/compare-academic-load-runs.mjs --from 10 --to 11
 *   node scripts/compare-academic-load-runs.mjs --from 10 --to 11 --out delta.json
 */
import fs from "fs";
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

const FROM = Number(argValue("--from"));
const TO = Number(argValue("--to"));
const OUT = argValue("--out");
const LIMIT = Number.parseInt(argValue("--limit") || "500", 10);

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
  if (!FROM || !TO) throw new Error("Indica --from <run_id> y --to <run_id>");

  const client = await pool.connect();
  try {
    const added = await client.query(
      `SELECT t.period_code, t.subject_code, t.group_code, t.person_id, t.aca_group_id,
              t.teacher_full_name, t.subject_name, t.program_name, t.enrolled_quantity,
              t.substantive_hours_quantity
       FROM academic_workload.academic_load_snapshot t
       WHERE t.import_run_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM academic_workload.academic_load_snapshot f
           WHERE f.import_run_id = $1
             AND f.period_code = t.period_code
             AND f.subject_code = t.subject_code
             AND f.group_code = t.group_code
             AND f.person_id = t.person_id
             AND COALESCE(f.aca_group_id,'') = COALESCE(t.aca_group_id,'')
         )
       ORDER BY 1,2,3,4
       LIMIT $3`,
      [FROM, TO, LIMIT]
    );

    const removed = await client.query(
      `SELECT f.period_code, f.subject_code, f.group_code, f.person_id, f.aca_group_id,
              f.teacher_full_name, f.subject_name, f.program_name, f.enrolled_quantity,
              f.substantive_hours_quantity
       FROM academic_workload.academic_load_snapshot f
       WHERE f.import_run_id = $1
         AND NOT EXISTS (
           SELECT 1 FROM academic_workload.academic_load_snapshot t
           WHERE t.import_run_id = $2
             AND t.period_code = f.period_code
             AND t.subject_code = f.subject_code
             AND t.group_code = f.group_code
             AND t.person_id = f.person_id
             AND COALESCE(t.aca_group_id,'') = COALESCE(f.aca_group_id,'')
         )
       ORDER BY 1,2,3,4
       LIMIT $3`,
      [FROM, TO, LIMIT]
    );

    const changed = await client.query(
      `SELECT
         t.period_code, t.subject_code, t.group_code, t.person_id, t.aca_group_id,
         t.teacher_full_name,
         f.enrolled_quantity AS enrolled_from,
         t.enrolled_quantity AS enrolled_to,
         f.substantive_hours_quantity AS hours_from,
         t.substantive_hours_quantity AS hours_to,
         f.program_name AS program_from,
         t.program_name AS program_to,
         encode(f.row_hash, 'hex') AS hash_from,
         encode(t.row_hash, 'hex') AS hash_to
       FROM academic_workload.academic_load_snapshot t
       JOIN academic_workload.academic_load_snapshot f
         ON f.import_run_id = $1
        AND f.period_code = t.period_code
        AND f.subject_code = t.subject_code
        AND f.group_code = t.group_code
        AND f.person_id = t.person_id
        AND COALESCE(f.aca_group_id,'') = COALESCE(t.aca_group_id,'')
       WHERE t.import_run_id = $2
         AND f.row_hash IS DISTINCT FROM t.row_hash
       ORDER BY 1,2,3,4
       LIMIT $3`,
      [FROM, TO, LIMIT]
    );

    const counts = await client.query(
      `SELECT
         (SELECT count(*)::int FROM academic_workload.academic_load_snapshot WHERE import_run_id = $1) AS from_rows,
         (SELECT count(*)::int FROM academic_workload.academic_load_snapshot WHERE import_run_id = $2) AS to_rows`,
      [FROM, TO]
    );

    const payload = {
      from_run_id: FROM,
      to_run_id: TO,
      totals: {
        from_rows: counts.rows[0].from_rows,
        to_rows: counts.rows[0].to_rows,
        added_sample: added.rowCount,
        removed_sample: removed.rowCount,
        changed_sample: changed.rowCount,
        sample_limit: LIMIT,
      },
      added: added.rows,
      removed: removed.rows,
      changed: changed.rows,
    };

    const text = JSON.stringify(payload, null, 2);
    if (OUT) {
      fs.writeFileSync(OUT, text, "utf8");
      console.log(`Escrito ${OUT}`);
    } else {
      console.log(text);
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
