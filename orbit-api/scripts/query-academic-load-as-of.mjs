/**
 * Consulta la carga académica as-of un momento (corte oficial).
 *
 * Uso:
 *   node scripts/query-academic-load-as-of.mjs --at "2026-09-03T17:00:00-05:00"
 *   node scripts/query-academic-load-as-of.mjs --run-id 12
 *   node scripts/query-academic-load-as-of.mjs --at "2026-09-03T17:00:00-05:00" --period 26C11 --limit 50
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

const AT = argValue("--at");
const RUN_ID = argValue("--run-id");
const PERIOD = argValue("--period");
const PERSON_ID = argValue("--person-id");
const LIMIT = Number.parseInt(argValue("--limit") || "100", 10);
const OUT = argValue("--out");

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
  if (!AT && !RUN_ID) {
    throw new Error("Indica --at <timestamptz> o --run-id <id>");
  }

  const client = await pool.connect();
  try {
    let runId = RUN_ID ? Number(RUN_ID) : null;
    if (!runId) {
      const r = await client.query(
        `SELECT academic_workload.f_run_as_of($1::timestamptz) AS id`,
        [AT]
      );
      runId = r.rows[0]?.id != null ? Number(r.rows[0].id) : null;
      if (!runId) {
        console.log(JSON.stringify({ run_id: null, rows: [], message: "Sin corte oficial as-of" }, null, 2));
        return;
      }
    }

    const run = await client.query(
      `SELECT id, imported_at, fecha_carga, snapshot_type, is_official, status, row_count
       FROM academic_workload.import_run WHERE id = $1`,
      [runId]
    );
    if (!run.rows.length) throw new Error(`import_run ${runId} no existe`);

    const params = [runId];
    let where = "s.import_run_id = $1";
    if (PERIOD) {
      params.push(PERIOD);
      where += ` AND s.period_code = $${params.length}`;
    }
    if (PERSON_ID) {
      params.push(Number(PERSON_ID));
      where += ` AND s.person_id = $${params.length}`;
    }
    params.push(LIMIT);

    const data = await client.query(
      `SELECT s.*
       FROM academic_workload.academic_load_snapshot s
       WHERE ${where}
       ORDER BY s.period_code, s.subject_code, s.group_code, s.person_id
       LIMIT $${params.length}`,
      params
    );

    const payload = {
      run: run.rows[0],
      as_of: AT,
      count: data.rowCount,
      rows: data.rows,
    };
    const text = JSON.stringify(payload, null, 2);
    if (OUT) {
      fs.writeFileSync(OUT, text, "utf8");
      console.log(`Escrito ${OUT} (${data.rowCount} filas, run=${runId})`);
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
