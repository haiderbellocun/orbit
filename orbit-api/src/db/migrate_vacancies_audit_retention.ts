/**
 * Conserva filas de vacancy_change_log cuando se elimina la vacante (entity_id → SET NULL).
 */
import { pool } from "./connection";

async function migrate(): Promise<void> {
  await pool.query(`
    ALTER TABLE vacancies.vacancy_change_log
      ALTER COLUMN entity_id DROP NOT NULL
  `);

  await pool.query(`
    DO $body$
    DECLARE
      cname text;
    BEGIN
      SELECT con.conname INTO cname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'vacancies'
        AND rel.relname = 'vacancy_change_log'
        AND con.contype = 'f'
        AND pg_get_constraintdef(con.oid) LIKE '%entity_id%'
      LIMIT 1;

      IF cname IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE vacancies.vacancy_change_log DROP CONSTRAINT %I',
          cname
        );
      END IF;
    END
    $body$
  `);

  await pool.query(`
    ALTER TABLE vacancies.vacancy_change_log
      ADD CONSTRAINT vacancy_change_log_entity_id_fkey
      FOREIGN KEY (entity_id)
      REFERENCES vacancies.vacancy(id)
      ON DELETE SET NULL
  `);

  await pool.query(`
    DO $body$
    DECLARE
      cname text;
    BEGIN
      SELECT con.conname INTO cname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE nsp.nspname = 'vacancies'
        AND rel.relname = 'vacancy_change_log'
        AND con.contype = 'f'
        AND pg_get_constraintdef(con.oid) LIKE '%vacancy_id%'
        AND con.conname <> 'vacancy_change_log_entity_id_fkey'
      LIMIT 1;

      IF cname IS NOT NULL THEN
        EXECUTE format(
          'ALTER TABLE vacancies.vacancy_change_log DROP CONSTRAINT %I',
          cname
        );
        EXECUTE format(
          'ALTER TABLE vacancies.vacancy_change_log
             ADD CONSTRAINT %I
             FOREIGN KEY (vacancy_id)
             REFERENCES vacancies.vacancy(id)
             ON DELETE SET NULL',
          cname
        );
      END IF;
    END
    $body$
  `);

  console.log("migrate_vacancies_audit_retention: OK");
  await pool.end();
}

migrate().catch((e) => {
  console.error("migrate_vacancies_audit_retention failed:", e);
  process.exit(1);
});
