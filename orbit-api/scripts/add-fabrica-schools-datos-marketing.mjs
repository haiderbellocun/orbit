/**
 * Crea las escuelas DATOS y MARKETING en el área FÁBRICA Y DESARROLLO.
 *
 * Uso:
 *   node scripts/add-fabrica-schools-datos-marketing.mjs          # dry-run
 *   node scripts/add-fabrica-schools-datos-marketing.mjs --apply  # escribe
 */
import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const APPLY = process.argv.includes("--apply");

const sslFlag = String(process.env.DB_SSL ?? "").trim().toLowerCase();
const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
const ssl =
  sslFlag === "true" || sslFlag === "1"
    ? { rejectUnauthorized: false }
    : host && host !== "localhost" && host !== "127.0.0.1"
      ? { rejectUnauthorized: false }
      : undefined;

const schema = (process.env.DB_SCHEMA ?? "core").trim();
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl,
  options: `-c search_path=${schema},public`,
});

const SCHOOL_NAMES = ["DATOS", "MARKETING"];

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const cols = await client.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'school'
     ORDER BY ordinal_position`,
    [schema]
  );
  const colSet = new Set(cols.rows.map((r) => r.column_name));
  console.log("school columns:", [...colSet].join(", "));

  const areas = await client.query(
    `SELECT id, name
     FROM area
     WHERE UPPER(TRIM(name)) LIKE '%FABRICA%'
        OR UPPER(TRIM(name)) LIKE '%DESARROLLO%'
     ORDER BY id`
  );
  console.log("matching areas:", JSON.stringify(areas.rows, null, 2));

  const areaHit =
    areas.rows.find((a) => fold(a.name) === "FABRICA Y DESARROLLO") ??
    areas.rows.find((a) => fold(a.name).includes("FABRICA Y DESARROLLO")) ??
    areas.rows.find((a) => fold(a.name).includes("FABRICA"));

  if (!areaHit) {
    throw new Error("No se encontró el área FÁBRICA Y DESARROLLO");
  }
  console.log("using area:", areaHit);

  const schools = await client.query(
    `SELECT id, name, area_id, is_active
     FROM school
     WHERE area_id = $1
     ORDER BY id`,
    [areaHit.id]
  );
  console.log("existing schools in area:", JSON.stringify(schools.rows, null, 2));

  const results = [];
  for (const name of SCHOOL_NAMES) {
    const existing = await client.query(
      `SELECT id, name, area_id, is_active, is_operative, code
       FROM school
       WHERE area_id = $1
         AND UPPER(TRIM(name)) = UPPER(TRIM($2))
       LIMIT 1`,
      [areaHit.id, name]
    );
    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      if (
        APPLY &&
        colSet.has("is_operative") &&
        row.is_operative !== true
      ) {
        await client.query(
          `UPDATE school
           SET is_operative = true, code = NULL, updated_at = NOW()
           WHERE id = $1`,
          [row.id]
        );
        results.push({ action: "aligned", school: { ...row, is_operative: true, code: null } });
      } else {
        results.push({ action: "exists", school: row });
      }
      continue;
    }

    if (!APPLY) {
      results.push({
        action: "dry_run_create",
        payload: { name, area_id: areaHit.id, is_active: true },
      });
      continue;
    }

    const insertFields = ["name", "area_id", "is_active"];
    const insertValues = [name, areaHit.id, true];
    if (colSet.has("is_operative")) {
      insertFields.push("is_operative");
      insertValues.push(true);
    }
    insertFields.push("created_at", "updated_at");
    const ph = insertValues.map((_, i) => `$${i + 1}`);
    ph.push("NOW()", "NOW()");

    const inserted = await client.query(
      `INSERT INTO school (${insertFields.join(", ")})
       VALUES (${ph.join(", ")})
       RETURNING id, name, area_id, is_active`,
      insertValues
    );
    results.push({ action: "created", school: inserted.rows[0] });
  }

  console.log(JSON.stringify(results, null, 2));

  if (APPLY) {
    await client.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await client.query("ROLLBACK");
    console.log("DRY-RUN rolled back (no changes). Re-run with --apply to write.");
  }
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
