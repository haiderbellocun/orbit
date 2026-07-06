import { pool } from "./connection";

/**
 * Agrega y rellena public_id (secuencial) en vacancies.vacancy y vacancies.requisition.
 * Mantiene UUID como PK para no romper FKs existentes.
 */
async function migrateVacanciesPublicIds(): Promise<void> {
  await pool.query(`
    ALTER TABLE vacancies.vacancy
      ADD COLUMN IF NOT EXISTS public_id BIGSERIAL
  `);
  await pool.query(`
    ALTER TABLE vacancies.requisition
      ADD COLUMN IF NOT EXISTS public_id BIGSERIAL
  `);

  // Backfill para filas existentes (si el serial creó la secuencia, usamos nextval).
  // El nombre de la secuencia por defecto suele ser <table>_<col>_seq.
  await pool.query(`
    UPDATE vacancies.vacancy
    SET public_id = nextval('vacancies.vacancy_public_id_seq')
    WHERE public_id IS NULL
  `);
  await pool.query(`
    UPDATE vacancies.requisition
    SET public_id = nextval('vacancies.requisition_public_id_seq')
    WHERE public_id IS NULL
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_vacancy_public_id
      ON vacancies.vacancy(public_id)
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_requisition_public_id
      ON vacancies.requisition(public_id)
  `);

  console.log("migrate_vacancies_public_ids: OK");
}

migrateVacanciesPublicIds()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("migrate_vacancies_public_ids failed:", e);
    process.exit(1);
  });

