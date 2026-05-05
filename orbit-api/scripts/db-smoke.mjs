import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

function resolveSsl() {
  const flag = (process.env.DB_SSL ?? "").trim().toLowerCase();
  const sslMode = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  const requireSsl =
    flag === "true" ||
    flag === "1" ||
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full";
  if (!requireSsl) return undefined;
  const rejectUnauthorized =
    (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
    "true";
  return { rejectUnauthorized };
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  ssl: resolveSsl(),
});

const main = async () => {
  const v = await pool.query("SELECT current_database() AS db, current_user AS usr, version() AS v");
  const s = await pool.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      AND schema_name NOT LIKE 'pg_toast%'
    ORDER BY 1
  `);
  const t = await pool.query(`
    SELECT table_schema, COUNT(*)::int AS n
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
    GROUP BY 1
    ORDER BY 1
  `);
  console.log(JSON.stringify({ info: v.rows[0], schemas: s.rows, tableCounts: t.rows }, null, 2));
  await pool.end();
};

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
