import { pool } from "./connection";

/**
 * Añade person.is_active en public.person y/o core.person (GCP).
 * Inactivos (false) no se listan en LITE / coordinador / docente.
 */
async function migratePersonIsActive(): Promise<void> {
  await pool.query(`
    DO $do$
    BEGIN
      IF to_regclass('public.person') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.person ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
        EXECUTE 'UPDATE public.person SET is_active = true WHERE is_active IS NULL';
      END IF;
      IF to_regclass('core.person') IS NOT NULL THEN
        EXECUTE 'ALTER TABLE core.person ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true';
        EXECUTE 'UPDATE core.person SET is_active = true WHERE is_active IS NULL';
      END IF;
    END
    $do$;
  `);
  console.log("Migración person.is_active completada");
  await pool.end();
}

migratePersonIsActive().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
