/**
 * Aplica un archivo .sql completo a Postgres usando psql (libpq).
 * Ideal para GCP / Cloud SQL porque node-postgres suele rechazar múltiples sentencias
 * y PL/pgSQL en un solo round-trip.
 *
 * Requisitos:
 * - psql en PATH, o define PSQL_EXE con ruta absoluta al ejecutable.
 *
 * Variables (.env):
 * - DB_HOST, DB_PORT, DB_NAME, DB_USERNAME, DB_PASSWORD
 * - DB_SSL=true|false  (por defecto: true si DB_HOST no es localhost)
 * - PSQL_EXE           (opcional)
 *
 * Uso:
 *   node scripts/apply-gcp-schema.mjs
 *   node scripts/apply-gcp-schema.mjs ..\gcp_schema_migration.sql
 */

import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

dotenv.config({ override: true });

function isLocalHost(host) {
  const h = String(host ?? "").trim().toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function resolveSslMode() {
  const explicit = (process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "true" || explicit === "1") return "require";
  if (explicit === "false" || explicit === "0") return "prefer";
  const fromEnv = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  if (fromEnv) return fromEnv;
  return isLocalHost(process.env.DB_HOST) ? "prefer" : "require";
}

function findPsqlExecutable() {
  if (process.env.PSQL_EXE && fs.existsSync(process.env.PSQL_EXE)) {
    return process.env.PSQL_EXE;
  }
  const candidates = [
    "C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe",
    "C:\\Program Files\\PostgreSQL\\16\\bin\\psql.exe",
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return "psql";
}

function stripBom(text) {
  if (text.charCodeAt(0) === 0xfeff) return text.slice(1);
  if (text.startsWith("\u{feff}")) return text.slice(1);
  // UTF-8 BOM as seen by some Windows tools: EF BB BF
  if (text.startsWith("\u{fffe}")) return text.slice(1);
  return text;
}

function readSqlFileNoBom(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.subarray(3).toString("utf8");
  }
  return stripBom(buf.toString("utf8"));
}

const sqlArg = process.argv[2];
const sqlFile = path.resolve(
  process.cwd(),
  sqlArg ?? "gcp_schema_migration.sql"
);

if (!fs.existsSync(sqlFile)) {
  console.error(`No existe el archivo SQL: ${sqlFile}`);
  process.exit(1);
}

const psql = findPsqlExecutable();

const sqlText = readSqlFileNoBom(sqlFile);

const env = {
  ...process.env,
  PGHOST: process.env.DB_HOST,
  PGPORT: String(process.env.DB_PORT ?? "5432"),
  PGDATABASE: process.env.DB_NAME,
  PGUSER: process.env.DB_USERNAME ?? process.env.DB_USER,
  PGPASSWORD: process.env.DB_PASSWORD ?? "",
  PGSSLMODE: resolveSslMode(),
};

console.log(`Aplicando SQL:`);
console.log(`- archivo: ${sqlFile}`);
console.log(`- host:    ${env.PGHOST}`);
console.log(`- db:      ${env.PGDATABASE}`);
console.log(`- user:    ${env.PGUSER}`);
console.log(`- psql:    ${psql}`);
console.log(`- sslmode: ${env.PGSSLMODE}`);

const result = spawnSync(
  psql,
  [
    "-v",
    "ON_ERROR_STOP=1",
    "-X",
    "-q",
    "-f",
    "-",
  ],
  {
    env,
    input: sqlText,
    stdio: ["pipe", "inherit", "inherit"],
    shell: false,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 256,
  }
);

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
