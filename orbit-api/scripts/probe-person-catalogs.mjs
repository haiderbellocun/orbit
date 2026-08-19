/**
 * Probe catálogos core.* para la plantilla de personal.
 *   node scripts/probe-person-catalogs.mjs
 */
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

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

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME,
  ssl: resolveSsl(),
});

async function main() {
  const cols = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema='core' AND table_name='person'
     ORDER BY ordinal_position`
  );
  console.log(
    "person_cols:",
    cols.rows.map((r) => r.column_name).join(", ")
  );

  const queries = [
    [
      "area",
      `SELECT id, code, name FROM core.area WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
    [
      "school",
      `SELECT id, code, name, area_id FROM core.school WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
    [
      "program",
      `SELECT id, code, name, school_id FROM core.program WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
    [
      "role",
      `SELECT id, code, name FROM core.role WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
    [
      "hierarchy",
      `SELECT id, name, level FROM core.hierarchy ORDER BY level NULLS LAST, name`,
    ],
    [
      "contract_type",
      `SELECT id, code, name FROM core.contract_type WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
    [
      "city",
      `SELECT id, name FROM core.city WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
    [
      "region",
      `SELECT id, name FROM core.region WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
    [
      "campus",
      `SELECT id, name FROM core.campus WHERE COALESCE(is_active,true)=true ORDER BY name`,
    ],
  ];

  for (const [name, sql] of queries) {
    try {
      const r = await pool.query(sql);
      console.log(`\n=== ${name} (${r.rows.length}) ===`);
      for (const row of r.rows.slice(0, 8)) console.log(row);
      if (r.rows.length > 8) console.log(`... +${r.rows.length - 8} more`);
    } catch (e) {
      console.log(`\n=== ${name} ERR ===`, e.message);
    }
  }

  for (const [label, sql] of [
    [
      "type_document",
      `SELECT DISTINCT NULLIF(TRIM(type_document),'') AS v
       FROM core.person WHERE NULLIF(TRIM(type_document),'') IS NOT NULL ORDER BY 1`,
    ],
    [
      "gender",
      `SELECT DISTINCT NULLIF(TRIM(gender),'') AS v
       FROM core.person WHERE NULLIF(TRIM(gender),'') IS NOT NULL ORDER BY 1`,
    ],
    [
      "role_eval",
      `SELECT DISTINCT NULLIF(TRIM(role_eval),'') AS v
       FROM core.person WHERE NULLIF(TRIM(role_eval),'') IS NOT NULL ORDER BY 1`,
    ],
  ]) {
    try {
      const r = await pool.query(sql);
      console.log(
        `\n${label}:`,
        r.rows.map((x) => x.v)
      );
    } catch (e) {
      console.log(`\n${label} ERR:`, e.message);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
