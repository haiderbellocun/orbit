/**
 * Inserta roles de cargo (core.role) para especializaciones ESP. en el catálogo core.
 * Idempotente: no duplica si el nombre ya existe (case-insensitive).
 *
 * Uso:
 *   node scripts/migrate-add-core-esp-roles.mjs
 */

import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const schemaSearchPath = (process.env.DB_SCHEMA ?? "public").trim();

function isLocalHost(host) {
  const h = String(host ?? "")
    .trim()
    .toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function resolveSsl() {
  const explicit = (process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return undefined;
  if (explicit === "true" || explicit === "1") {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    return { rejectUnauthorized };
  }
  const sslMode = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  if (
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  ) {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    return { rejectUnauthorized };
  }
  if (!isLocalHost(process.env.DB_HOST)) {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
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
  ssl: resolveSsl(),
  options: `-c search_path=${schemaSearchPath},public`,
});

/** Cargos ESP. para vacantes (datalist /catalog/roles). */
const ESP_ROLES = [
  "ESP. Analitica de Datos e Inteligencia de negocios",
  "ESP. Seguridad y Salud en el Trabajo y Desarrollo organizacional y Talento Humano",
  "ESP. Innovación de Modas",
];

async function ensureCoreRoleTable(client) {
  const result = await client.query(
    `SELECT to_regclass('core.role') AS reg`
  );
  if (!result.rows[0]?.reg) {
    throw new Error(
      "No existe core.role. Verifica DB_SCHEMA y que el catálogo core esté migrado."
    );
  }
}

async function upsertRole(client, name) {
  const existing = await client.query(
    `SELECT id, name, code
     FROM core.role
     WHERE lower(trim(name)) = lower(trim($1))
     LIMIT 1`,
    [name]
  );

  if (existing.rows.length > 0) {
    const row = existing.rows[0];
    console.log(`  ya existe id=${row.id}: ${row.name}`);
    return { id: row.id, isNew: false };
  }

  const inserted = await client.query(
    `INSERT INTO core.role (name, description, is_active)
     VALUES ($1, $2, true)
     RETURNING id`,
    [name, "Cargo especialización ESP."]
  );

  const id = inserted.rows[0].id;
  await client.query(
    `UPDATE core.role
     SET code = upper(regexp_replace(trim(name), '\\s+', '_', 'g'))
     WHERE id = $1
       AND (code IS NULL OR trim(code) = '')`,
    [id]
  );

  console.log(`  creado id=${id}: ${name}`);
  return { id, isNew: true };
}

const main = async () => {
  const client = await pool.connect();
  try {
    await ensureCoreRoleTable(client);
    console.log("Insertando roles ESP. en core.role…");

    let created = 0;
    for (const name of ESP_ROLES) {
      const result = await upsertRole(client, name);
      if (result.isNew) created++;
    }

    console.log(`Listo: ${created} nuevo(s), ${ESP_ROLES.length - created} ya existían.`);
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
