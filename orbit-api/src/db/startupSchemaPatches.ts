import { pool } from "./connection";
import { ensureSecondInCommandScopes } from './secondInCommandSchema';

/**
 * Parches idempotentes al arrancar (p. ej. Cloud Run tras deploy).
 * Evita errores 22001 cuando la columna quedó en VARCHAR(20) en bases antiguas.
 */
export async function runStartupSchemaPatches(): Promise<void> {
  await ensureSecondInCommandScopes();
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

  const statusConstraint = await pool.query<{ def: string | null }>(`
    SELECT pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'vacancies'
      AND t.relname = 'vacancy'
      AND c.conname = 'vacancy_operation_status_check'
  `);
  const statusDef = String(statusConstraint.rows[0]?.def ?? "");
  if (statusDef.length > 0 && !statusDef.includes("internal_movement")) {
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
      "startupSchemaPatches: operation_status incluye internal_movement"
    );
  }

  await ensurePersonManagerId();
  await ensurePlantaOrgOverride();
  await ensureCoreUserIdSequence();
}

/** Responsable directo: `person.manager_id` → `person.id` (auto-FK). */
async function ensurePersonManagerId(): Promise<void> {
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
}

/** Jerarquía de Planta Activa: overlay local, no escribe Organigrama. */
async function ensurePlantaOrgOverride(): Promise<void> {
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
          'CREATE TABLE IF NOT EXISTS %I.planta_org_override (
             person_id BIGINT PRIMARY KEY REFERENCES %I.person(id) ON DELETE CASCADE,
             parent_person_id BIGINT REFERENCES %I.person(id) ON DELETE SET NULL,
             updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
             CONSTRAINT planta_org_override_not_self
               CHECK (parent_person_id IS NULL OR parent_person_id <> person_id)
           )',
          sch,
          sch,
          sch
        );

        EXECUTE format(
          'CREATE INDEX IF NOT EXISTS idx_planta_org_override_parent
             ON %I.planta_org_override (parent_person_id)',
          sch
        );
      END LOOP;
    END
    $do$;
  `);
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
