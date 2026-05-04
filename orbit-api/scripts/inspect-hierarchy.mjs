import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const schemaSearchPath = (process.env.DB_SCHEMA ?? "public").trim();

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  ssl: (() => {
    const explicit = (process.env.DB_SSL ?? "").trim().toLowerCase();
    if (explicit === "false" || explicit === "0") return undefined;
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    const host = String(process.env.DB_HOST ?? "").toLowerCase();
    const local =
      host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (explicit === "true" || explicit === "1" || !local) {
      return { rejectUnauthorized };
    }
    return undefined;
  })(),
  options: `-c search_path=${schemaSearchPath},public`,
});

const qTable = `
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'core' AND table_name = 'hierarchy'
ORDER BY ordinal_position`;

const main = async () => {
  const cols = await pool.query(qTable);
  const stats = await pool.query(`
    SELECT
      COUNT(*)::int AS row_count,
      COALESCE(MAX(id), 0)::bigint AS max_id
    FROM core.hierarchy
  `);
  const seqs = await pool.query(`
    SELECT c.relname AS sequence_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'S'
      AND n.nspname = 'core'
      AND c.relname ILIKE '%hierarchy%'
    ORDER BY 1
  `);
  const indexes = await pool.query(`
    SELECT indexname, indexdef
    FROM pg_indexes
    WHERE schemaname = 'core' AND tablename = 'hierarchy'
    ORDER BY indexname
  `);
  console.log("columns", JSON.stringify(cols.rows, null, 2));
  console.log("stats", stats.rows[0]);
  console.log("sequences", seqs.rows);
  console.log("indexes", indexes.rows);
  await pool.end();
};

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
