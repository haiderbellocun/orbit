import { pool } from "./connection";

/**
 * Migración incremental vacantes:
 * - req_number opcional en requisition
 * - operation_status cancelled_by_capital
 * - direct_manager_identification en vacancy
 */
async function migrateVacanciesUpdates(): Promise<void> {
  await pool.query(`
    ALTER TABLE vacancies.vacancy
      ADD COLUMN IF NOT EXISTS direct_manager_identification VARCHAR(20)
  `);
  console.log(
    "migrate_vacancies_updates: direct_manager_identification en vacancy"
  );

  const reqNullable = await pool.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'vacancies'
      AND table_name = 'requisition'
      AND column_name = 'req_number'
  `);
  if (reqNullable.rows[0]?.is_nullable === "NO") {
    await pool.query(
      `ALTER TABLE vacancies.requisition ALTER COLUMN req_number DROP NOT NULL`
    );
    console.log("migrate_vacancies_updates: req_number ahora es nullable");
  }

  const constraint = await pool.query(`
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'vacancies'
      AND t.relname = 'vacancy'
      AND c.conname = 'vacancy_operation_status_check'
  `);
  const def = String(constraint.rows[0]?.def ?? "");
  if (!def.includes("cancelled_by_capital")) {
    await pool.query(
      `ALTER TABLE vacancies.vacancy DROP CONSTRAINT IF EXISTS vacancy_operation_status_check`
    );
    await pool.query(`
      ALTER TABLE vacancies.vacancy
      ADD CONSTRAINT vacancy_operation_status_check CHECK (
        operation_status IN (
          'open', 'selected', 'requisition_sent', 'hired', 'closed',
          'cancelled', 'cancelled_by_capital'
        )
      )
    `);
    console.log(
      "migrate_vacancies_updates: operation_status incluye cancelled_by_capital"
    );
  }
}

migrateVacanciesUpdates()
  .then(() => {
    console.log("migrate_vacancies_updates: OK");
    process.exit(0);
  })
  .catch((e) => {
    console.error("migrate_vacancies_updates failed:", e);
    process.exit(1);
  });
