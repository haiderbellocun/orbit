/**
 * Agrega columnas de auditoría a core.person:
 * - created_at  (equivalente a createdAt)
 * - updated_at  (equivalente a updatedAt)
 *
 * Uso:
 *   node scripts/migrate-core-person-audit-columns.mjs
 */

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
  options: `-c search_path=${schemaSearchPath},public`,
});

const migrateSql = `
ALTER TABLE core.person
  ADD COLUMN IF NOT EXISTS created_at timestamp without time zone;

ALTER TABLE core.person
  ADD COLUMN IF NOT EXISTS updated_at timestamp without time zone;

UPDATE core.person
SET
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW())
WHERE created_at IS NULL OR updated_at IS NULL;

ALTER TABLE core.person
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE core.person
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL;

DROP TRIGGER IF EXISTS trg_core_person_set_updated_at ON core.person;
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

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await ensureUpdatedAtFunction(client);
    await client.query(migrateSql);

    const triggerPg15 = `
CREATE TRIGGER trg_core_person_set_updated_at
BEFORE UPDATE ON core.person
FOR EACH ROW
EXECUTE FUNCTION core.set_updated_at();
`;
    const triggerLegacy = `
CREATE TRIGGER trg_core_person_set_updated_at
BEFORE UPDATE ON core.person
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

    await client.query("COMMIT");
    console.log("OK: core.person ahora tiene created_at y updated_at (+ trigger updated_at).");
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
