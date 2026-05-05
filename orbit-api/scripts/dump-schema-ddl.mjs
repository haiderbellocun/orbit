/**
 * Genera DDL (CREATE SCHEMA / SEQUENCE / TABLE sin FK inline / ALTER CONSTRAINT)
 * a partir del estado actual de la base de datos conectada por .env.
 *
 * Uso:
 *   node scripts/dump-schema-ddl.mjs > schema_dump.sql
 */

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const schemaSearchPath = (process.env.DB_SCHEMA ?? "public").trim();

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

  return {
    rejectUnauthorized,
  };
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  ssl: resolveSsl(),
  options: `-c search_path=${schemaSearchPath},public`,
});

function quoteIdent(name) {
  if (!name) return '""';
  const safe = String(name);
  const needsQuote = !/^[a-z_][a-z0-9_]*$/.test(safe);
  return needsQuote ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function qualify(schema, name) {
  return `${quoteIdent(schema)}.${quoteIdent(name)}`;
}

async function listUserSchemas(client) {
  const res = await client.query(`
    SELECT schema_name
    FROM information_schema.schemata
    WHERE schema_name NOT IN ('pg_catalog', 'information_schema')
      AND schema_name NOT LIKE 'pg_toast%'
      AND schema_name NOT LIKE 'pg_temp_%'
    ORDER BY schema_name
  `);
  return res.rows.map((r) => r.schema_name);
}

async function listTables(client, schemas) {
  const res = await client.query(
    `
    SELECT table_schema, table_name
    FROM information_schema.tables
    WHERE table_type = 'BASE TABLE'
      AND table_schema = ANY($1::text[])
    ORDER BY table_schema, table_name
    `,
    [schemas]
  );
  return res.rows;
}

async function listSequences(client, schemas) {
  const res = await client.query(
    `
    SELECT sequence_schema, sequence_name
    FROM information_schema.sequences
    WHERE sequence_schema = ANY($1::text[])
    ORDER BY sequence_schema, sequence_name
    `,
    [schemas]
  );
  return res.rows;
}

async function getColumns(client, schema, table) {
  const res = await client.query(
    `
    SELECT
      att.attnum AS ordinal_position,
      att.attname AS column_name,
      pg_catalog.format_type(att.atttypid, att.atttypmod) AS data_type,
      att.attnotnull AS not_null,
      pg_catalog.pg_get_expr(ad.adbin, ad.adrelid) AS column_default
    FROM pg_catalog.pg_attribute att
    INNER JOIN pg_catalog.pg_class cls ON cls.oid = att.attrelid
    INNER JOIN pg_catalog.pg_namespace nsp ON nsp.oid = cls.relnamespace
    LEFT JOIN pg_catalog.pg_attrdef ad ON ad.adrelid = att.attrelid AND ad.adnum = att.attnum
    WHERE nsp.nspname = $1
      AND cls.relname = $2
      AND att.attnum > 0
      AND NOT att.attisdropped
    ORDER BY att.attnum
    `,
    [schema, table]
  );
  return res.rows;
}

async function getConstraints(client, schemas) {
  const res = await client.query(
    `
    SELECT
      src_ns.nspname AS table_schema,
      src.relname AS table_name,
      con.conname AS constraint_name,
      con.contype AS constraint_type,
      pg_catalog.pg_get_constraintdef(con.oid, true) AS definition,
      ref_ns.nspname AS foreign_table_schema,
      ref.relname AS foreign_table_name
    FROM pg_catalog.pg_constraint con
    INNER JOIN pg_catalog.pg_class src ON src.oid = con.conrelid
    INNER JOIN pg_catalog.pg_namespace src_ns ON src_ns.oid = src.relnamespace
    LEFT JOIN pg_catalog.pg_class ref ON ref.oid = con.confrelid
    LEFT JOIN pg_catalog.pg_namespace ref_ns ON ref_ns.oid = ref.relnamespace
    WHERE src_ns.nspname = ANY($1::text[])
      AND con.contype IN ('p', 'u', 'f', 'c')
    ORDER BY
      CASE con.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'c' THEN 3 WHEN 'f' THEN 4 ELSE 5 END,
      src_ns.nspname,
      src.relname,
      con.conname
    `,
    [schemas]
  );
  return res.rows;
}

function qualifyForeignKeyDefinition(definition, foreignSchema, foreignTable) {
  if (!definition || !foreignSchema || !foreignTable) return definition;
  const fq = qualify(foreignSchema, foreignTable);
  const escapedTable = foreignTable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refRegex = new RegExp(`REFERENCES\\s+(${escapedTable})\\s*\\(`, "i");
  return definition.replace(refRegex, `REFERENCES ${fq} (`);
}

async function main() {
  const client = await pool.connect();
  try {
    const schemas = await listUserSchemas(client);

    console.log("-- DDL generado desde el estado actual de la base");
    console.log(`-- Base de datos: ${process.env.DB_NAME}`);
    console.log("SET client_encoding = 'UTF8';");
    console.log(
      `SET search_path TO ${schemas.map((s) => quoteIdent(s)).join(", ")};`
    );
    console.log("");

    for (const s of schemas) {
      if (s === "public") continue;
      console.log(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(s)};`);
    }
    console.log("");

    const sequences = await listSequences(client, schemas);
    for (const seq of sequences) {
      const fq = qualify(seq.sequence_schema, seq.sequence_name);
      console.log(`CREATE SEQUENCE IF NOT EXISTS ${fq};`);
    }
    if (sequences.length > 0) console.log("");

    const tables = await listTables(client, schemas);
    for (const t of tables) {
      const fqTable = qualify(t.table_schema, t.table_name);
      const cols = await getColumns(client, t.table_schema, t.table_name);
      console.log(`CREATE TABLE IF NOT EXISTS ${fqTable} (`);
      const lines = cols.map((col, idx) => {
        const segments = [`  ${quoteIdent(col.column_name)}`, col.data_type];
        if (col.column_default) {
          segments.push(`DEFAULT ${col.column_default}`);
        }
        segments.push(col.not_null ? "NOT NULL" : "NULL");
        const suffix = idx < cols.length - 1 ? "," : "";
        return `${segments.join(" ")}${suffix}`;
      });
      console.log(lines.join("\n"));
      console.log(");");
      console.log("");
    }

    const constraints = await getConstraints(client, schemas);
    for (const row of constraints) {
      const fqTable = qualify(row.table_schema, row.table_name);
      const stmtName =
        row.constraint_type === "p"
          ? "PRIMARY KEY"
          : row.constraint_type === "u"
            ? "UNIQUE"
            : row.constraint_type === "f"
              ? "FOREIGN KEY"
              : "CHECK";
      console.log(
        `-- ${stmtName}: ${row.table_schema}.${row.table_name}.${row.constraint_name}`
      );
      const def =
        row.constraint_type === "f"
          ? qualifyForeignKeyDefinition(
              row.definition,
              row.foreign_table_schema,
              row.foreign_table_name
            )
          : row.definition;
      console.log(
        `ALTER TABLE ONLY ${fqTable}\n  ADD CONSTRAINT ${quoteIdent(row.constraint_name)} ${def};`
      );
      console.log("");
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
