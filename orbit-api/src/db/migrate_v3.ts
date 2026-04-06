import { pool } from "./connection";

async function migrateV3(): Promise<void> {
  await pool.query(`
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS lite_name VARCHAR(150);
    ALTER TABLE teachers ADD COLUMN IF NOT EXISTS lite_document VARCHAR(50);
  `);
  console.log("Migración v3 completada");
  await pool.end();
}

migrateV3().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
