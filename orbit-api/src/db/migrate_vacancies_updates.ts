import { pool } from "./connection";

/**
 * Migración incremental vacantes:
 * - req_number opcional en requisition
 * - operation_status cancelled_by_capital, internal_movement
 * - direct_manager_identification en vacancy
 * - hired_quantity (personas contratadas vs quantity solicitada)
 */
export async function migrateVacanciesUpdates(): Promise<void> {
  await pool.query(`
    ALTER TABLE vacancies.vacancy
      ADD COLUMN IF NOT EXISTS direct_manager_identification VARCHAR(200)
  `);
  await pool.query(`
    ALTER TABLE vacancies.vacancy
      ALTER COLUMN direct_manager_identification TYPE VARCHAR(200)
  `);
  console.log(
    "migrate_vacancies_updates: direct_manager_identification VARCHAR(200)"
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
  if (!def.includes("internal_movement")) {
    await pool.query(
      `ALTER TABLE vacancies.vacancy DROP CONSTRAINT IF EXISTS vacancy_operation_status_check`
    );
    await pool.query(`
      ALTER TABLE vacancies.vacancy
      ADD CONSTRAINT vacancy_operation_status_check CHECK (
        operation_status IN (
          'open', 'selected', 'requisition_sent', 'internal_movement', 'hired',
          'closed', 'cancelled', 'cancelled_by_capital'
        )
      )
    `);
    console.log(
      "migrate_vacancies_updates: operation_status incluye internal_movement"
    );
  }

  const hiredQtyCol = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'vacancies'
      AND table_name = 'vacancy'
      AND column_name = 'hired_quantity'
  `);
  if (hiredQtyCol.rows.length === 0) {
    await pool.query(`
      ALTER TABLE vacancies.vacancy
        ADD COLUMN hired_quantity INTEGER NOT NULL DEFAULT 0
    `);
    await pool.query(`
      UPDATE vacancies.vacancy
      SET hired_quantity = quantity
      WHERE operation_status = 'hired' AND hired_quantity = 0
    `);
    await pool.query(`
      ALTER TABLE vacancies.vacancy
        ADD CONSTRAINT vacancy_hired_quantity_check
        CHECK (hired_quantity >= 0 AND hired_quantity <= quantity)
    `);
    console.log("migrate_vacancies_updates: hired_quantity agregada");
  }
}

const isMain =
  typeof require !== "undefined" &&
  require.main === module;

if (isMain) {
  migrateVacanciesUpdates()
    .then(() => {
      console.log("migrate_vacancies_updates: OK");
      process.exit(0);
    })
    .catch((e) => {
      console.error("migrate_vacancies_updates failed:", e);
      process.exit(1);
    });
}
