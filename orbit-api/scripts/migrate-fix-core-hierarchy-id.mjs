/**
 * Repara core.hierarchy.id cuando quedó como NOT NULL sin DEFAULT (tabla vacía / DDL manual).
 *
 * Uso:
 *   node scripts/migrate-fix-core-hierarchy-id.mjs
 */

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const schemaSearchPath = (process.env.DB_SCHEMA ?? "public").trim();

function sslConfig() {
  const explicit = (process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return undefined;
  const rejectUnauthorized =
    (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
    "true";
  const host = String(process.env.DB_HOST ?? "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (explicit === "true" || explicit === "1" || !local) {
    return { rejectUnauthorized };
  }
  return undefined;
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  ssl: sslConfig(),
  options: `-c search_path=${schemaSearchPath},public`,
});

const sql = `
CREATE SEQUENCE IF NOT EXISTS core.hierarchy_id_seq
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  START WITH 1
  OWNED BY NONE;

ALTER TABLE core.hierarchy
  ALTER COLUMN id SET DEFAULT nextval('core.hierarchy_id_seq'::regclass);

ALTER SEQUENCE core.hierarchy_id_seq OWNED BY core.hierarchy.id;

SELECT setval(
  'core.hierarchy_id_seq',
  GREATEST(
    (SELECT COALESCE(MAX(id), 0) FROM core.hierarchy),
    1
  ),
  true
);
`;

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("OK: core.hierarchy.id ahora tiene DEFAULT con secuencia core.hierarchy_id_seq.");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
