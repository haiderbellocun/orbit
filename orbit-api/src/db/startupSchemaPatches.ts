import { pool } from "./connection";

/**
 * Parches idempotentes al arrancar (p. ej. Cloud Run tras deploy).
 * Evita errores 22001 cuando la columna quedó en VARCHAR(20) en bases antiguas.
 */
export async function runStartupSchemaPatches(): Promise<void> {
  const { rows } = await pool.query<{ max_len: number | null }>(`
    SELECT character_maximum_length AS max_len
    FROM information_schema.columns
    WHERE table_schema = 'vacancies'
      AND table_name = 'vacancy'
      AND column_name = 'direct_manager_identification'
  `);

  if (rows.length === 0) return;

  const maxLen = rows[0]?.max_len;
  if (maxLen != null && maxLen >= 200) return;

  await pool.query(`
    ALTER TABLE vacancies.vacancy
      ALTER COLUMN direct_manager_identification TYPE VARCHAR(200)
  `);
  console.log(
    "startupSchemaPatches: direct_manager_identification ampliado a VARCHAR(200)"
  );
}
