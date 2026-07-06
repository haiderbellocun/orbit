/**
 * Crea la tabla core.person_program_assignments y hace backfill desde
 * core.person.program_id (cuando exista). Si la tabla legacy public.lites
 * existe con la columna academic_line, también copia esa información por
 * documento.
 *
 * - 1 fila por persona (UNIQUE person_id).
 * - programs_id INTEGER[] con todos los program.id asociados (deduplicado).
 * - academic_line por persona.
 *
 * Uso:
 *   node scripts/migrate-create-person-program-assignments.mjs
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

/** Misma lógica que src/db/connection.ts: hosts remotos usan TLS por defecto. */
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

const createTableSql = `
CREATE TABLE IF NOT EXISTS core.person_program_assignments (
  id BIGSERIAL PRIMARY KEY,
  person_id BIGINT NOT NULL UNIQUE REFERENCES core.person(id) ON DELETE CASCADE,
  programs_id INTEGER[] NOT NULL DEFAULT '{}',
  academic_line VARCHAR(150),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ppa_programs_id_gin
  ON core.person_program_assignments USING GIN (programs_id);

CREATE INDEX IF NOT EXISTS idx_ppa_academic_line
  ON core.person_program_assignments(academic_line);

DROP TRIGGER IF EXISTS trg_core_ppa_set_updated_at ON core.person_program_assignments;
`;

const backfillFromCorePersonSql = `
INSERT INTO core.person_program_assignments (person_id, programs_id, academic_line)
SELECT p.id, ARRAY[p.program_id]::INTEGER[], NULL
FROM core.person p
WHERE p.program_id IS NOT NULL
ON CONFLICT (person_id) DO NOTHING;
`;

const backfillAcademicLineFromLegacySql = `
UPDATE core.person_program_assignments ppa
SET academic_line = l.academic_line,
    updated_at = NOW()
FROM core.person p
JOIN public.lites l ON l.document = p.document
WHERE ppa.person_id = p.id
  AND l.academic_line IS NOT NULL
  AND ppa.academic_line IS NULL;
`;

async function ensureUpdatedAtFunction(client) {
  await client.query(`
    CREATE OR REPLACE FUNCTION core.set_updated_at()
    RETURNS trigger AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);
}

async function legacyLitesExists(client) {
  const result = await client.query(
    `SELECT to_regclass('public.lites') AS reg`
  );
  return Boolean(result.rows[0]?.reg);
}

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureUpdatedAtFunction(client);
    await client.query(createTableSql);

    const triggerPg15 = `
CREATE TRIGGER trg_core_ppa_set_updated_at
BEFORE UPDATE ON core.person_program_assignments
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();
`;
    const triggerLegacy = `
CREATE TRIGGER trg_core_ppa_set_updated_at
BEFORE UPDATE ON core.person_program_assignments
FOR EACH ROW
EXECUTE PROCEDURE core.set_updated_at();
`;

    try {
      await client.query(triggerPg15);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (
        msg.includes("syntax error") ||
        msg.includes("42809") ||
        msg.includes("EXECUTE FUNCTION")
      ) {
        await client.query(triggerLegacy);
      } else {
        throw e;
      }
    }

    const backfillResult = await client.query(backfillFromCorePersonSql);
    console.log(
      `Backfill desde core.person.program_id: ${backfillResult.rowCount ?? 0} filas insertadas.`
    );

    if (await legacyLitesExists(client)) {
      const updateResult = await client.query(backfillAcademicLineFromLegacySql);
      console.log(
        `Backfill de academic_line desde public.lites: ${updateResult.rowCount ?? 0} filas actualizadas.`
      );
    } else {
      console.log(
        "public.lites no existe; se omite backfill de academic_line legacy."
      );
    }

    await client.query("COMMIT");
    console.log(
      "OK: core.person_program_assignments creada con índices, trigger y backfill."
    );
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

main();
