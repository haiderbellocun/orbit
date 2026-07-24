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

  if (rows.length > 0) {
    const maxLen = rows[0]?.max_len;
    if (maxLen == null || maxLen < 200) {
      await pool.query(`
        ALTER TABLE vacancies.vacancy
          ALTER COLUMN direct_manager_identification TYPE VARCHAR(200)
      `);
      console.log(
        "startupSchemaPatches: direct_manager_identification ampliado a VARCHAR(200)"
      );
    }
  }

  const hiredQty = await pool.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'vacancies'
      AND table_name = 'vacancy'
      AND column_name = 'hired_quantity'
  `);
  if (hiredQty.rows.length === 0) {
    await pool.query(`
      ALTER TABLE vacancies.vacancy
        ADD COLUMN IF NOT EXISTS hired_quantity INTEGER NOT NULL DEFAULT 0
    `);
    await pool.query(`
      UPDATE vacancies.vacancy
      SET hired_quantity = quantity
      WHERE operation_status = 'hired' AND hired_quantity = 0
    `);
    await pool.query(`
      DO $patch$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'vacancy_hired_quantity_check'
        ) THEN
          ALTER TABLE vacancies.vacancy
            ADD CONSTRAINT vacancy_hired_quantity_check
            CHECK (hired_quantity >= 0 AND hired_quantity <= quantity);
        END IF;
      END $patch$
    `);
    console.log("startupSchemaPatches: hired_quantity agregada");
  }

  await ensureCoreUserIdSequence();
}

/** `core.user.id` es NOT NULL sin DEFAULT ni sequence en algunas bases. */
async function ensureCoreUserIdSequence(): Promise<void> {
  const schema = (process.env.DB_SCHEMA ?? "public").trim() || "public";
  const { rows } = await pool.query<{ column_default: string | null }>(
    `SELECT column_default
     FROM information_schema.columns
     WHERE table_schema = $1
       AND table_name = 'user'
       AND column_name = 'id'`,
    [schema]
  );
  if (rows.length === 0) return;
  if (rows[0]?.column_default) return;

  // Solo caracteres seguros para identificadores SQL (env controlado).
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    console.warn(
      `startupSchemaPatches: DB_SCHEMA inválido para parche user.id (${schema})`
    );
    return;
  }

  const seqName = "user_id_seq";
  const qualifiedSeq = `"${schema}"."${seqName}"`;
  const qualifiedTable = `"${schema}"."user"`;
  const regclassLiteral = `'${schema}.${seqName}'::regclass`;

  await pool.query(`CREATE SEQUENCE IF NOT EXISTS ${qualifiedSeq}`);
  await pool.query(
    `SELECT setval(
       ${regclassLiteral},
       GREATEST((SELECT COALESCE(MAX(id), 1) FROM ${qualifiedTable}), 1),
       true
     )`
  );
  await pool.query(
    `ALTER TABLE ${qualifiedTable}
       ALTER COLUMN id SET DEFAULT nextval(${regclassLiteral})`
  );
  await pool.query(
    `ALTER SEQUENCE ${qualifiedSeq} OWNED BY ${qualifiedTable}.id`
  );
  console.log(`startupSchemaPatches: ${schema}.user.id → sequence ${seqName}`);
}
