import { pool } from "./connection";

/**
 * Amplía direct_manager_identification para almacenar nombre del jefe inmediato.
 */
async function migrateDirectManagerIdentificationLength(): Promise<void> {
  await pool.query(`
    ALTER TABLE vacancies.vacancy
      ALTER COLUMN direct_manager_identification TYPE VARCHAR(200)
  `);
  console.log(
    "migrate_direct_manager_identification_length: VARCHAR(200) aplicado"
  );
}

migrateDirectManagerIdentificationLength()
  .then(() => {
    console.log("migrate_direct_manager_identification_length: OK");
    process.exit(0);
  })
  .catch((e) => {
    console.error("migrate_direct_manager_identification_length failed:", e);
    process.exit(1);
  });
