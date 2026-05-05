/**
 * Repara columnas core.*.id cuando quedaron BIGINT NOT NULL sin DEFAULT (DDL manual / GCP).
 * Incluye las tablas que usa la importación masiva.
 *
 * Uso:
 *   node scripts/migrate-fix-core-catalog-id-sequences.mjs
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

/** @type {Array<{ table: string; seq: string }>} */
const TABLES = [
  { table: "core.contract_type", seq: "core.contract_type_id_seq" },
  { table: "core.role", seq: "core.role_id_seq" },
  { table: "core.city", seq: "core.city_id_seq" },
  { table: "core.school", seq: "core.school_id_seq" },
  { table: "core.program", seq: "core.program_id_seq" },
  { table: "core.area", seq: "core.area_id_seq" },
  { table: "core.person", seq: "core.person_id_seq" },
  { table: "core.hierarchy", seq: "core.hierarchy_id_seq" },
];

function fixTableSql(table, seq) {
  return `
CREATE SEQUENCE IF NOT EXISTS ${seq}
  AS bigint
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  START WITH 1
  OWNED BY NONE;

ALTER TABLE ${table}
  ALTER COLUMN id SET DEFAULT nextval('${seq}'::regclass);

ALTER SEQUENCE ${seq} OWNED BY ${table}.id;

SELECT setval(
  '${seq}',
  GREATEST((SELECT COALESCE(MAX(id), 0)::bigint FROM ${table}), 1::bigint),
  true
);
`;
}

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const { table, seq } of TABLES) {
      await client.query(fixTableSql(table, seq));
      console.log(`OK: ${table}.id → DEFAULT ${seq}`);
    }
    await client.query("COMMIT");
    console.log(
      "Listo: secuencias y DEFAULT en id para tablas core del import."
    );
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
