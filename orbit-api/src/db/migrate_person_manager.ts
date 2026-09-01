import { pool } from "./connection";

/**
 * Añade person.manager_id (responsable directo) en public.person y/o core.person.
 */
async function migratePersonManager(): Promise<void> {
  await pool.query(`
    DO $do$
    DECLARE
      sch text;
    BEGIN
      FOREACH sch IN ARRAY ARRAY['public', 'core'] LOOP
        IF to_regclass(sch || '.person') IS NULL THEN
          CONTINUE;
        END IF;

        EXECUTE format(
          'ALTER TABLE %I.person ADD COLUMN IF NOT EXISTS manager_id BIGINT',
          sch
        );

        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS idx_person_manager_id ON %I.person (manager_id)',
          sch
        );

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = sch
            AND t.relname = 'person'
            AND c.conname = 'person_manager_id_fkey'
        ) THEN
          EXECUTE format(
            'ALTER TABLE %I.person
               ADD CONSTRAINT person_manager_id_fkey
               FOREIGN KEY (manager_id) REFERENCES %I.person(id)
               ON DELETE SET NULL',
            sch,
            sch
          );
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_namespace n ON n.oid = t.relnamespace
          WHERE n.nspname = sch
            AND t.relname = 'person'
            AND c.conname = 'person_manager_not_self'
        ) THEN
          EXECUTE format(
            'ALTER TABLE %I.person
               ADD CONSTRAINT person_manager_not_self
               CHECK (manager_id IS NULL OR manager_id <> id)',
            sch
          );
        END IF;
      END LOOP;
    END
    $do$;
  `);
  console.log("Migración person.manager_id completada");
  await pool.end();
}

migratePersonManager().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
