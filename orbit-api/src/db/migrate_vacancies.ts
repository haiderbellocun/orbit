import { pool } from "./connection";
import { resolveCoreSchemaMode, type CoreSchemaMode } from "../lib/coreSchema";

/**
 * Schema `vacancies`: flujo operativo (vacante → requisición opcional).
 * Las FK de `vacancies.vacancy` apuntan a `area`, `school`, `program` en el
 * mismo esquema que use el resto del proyecto (`core` o `public`), detectado
 * en tiempo de migración.
 */

function buildVacanciesDdl(coreSchema: CoreSchemaMode): string {
  const sch = coreSchema === "core" ? "core" : "public";
  const refArea = `${sch}.area`;
  const refSchool = `${sch}.school`;
  const refProgram = `${sch}.program`;

  return `
CREATE SCHEMA IF NOT EXISTS vacancies;

CREATE TABLE IF NOT EXISTS vacancies.vacancy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id BIGSERIAL UNIQUE,
  area_id INTEGER NOT NULL,
  school_id INTEGER,
  program_id INTEGER,
  position_name VARCHAR(255) NOT NULL,
  curricular_line VARCHAR(500),
  quantity INTEGER NOT NULL,
  operation_status VARCHAR(40) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  direct_manager_identification VARCHAR(200),
  created_by_person_id INTEGER,
  updated_by_person_id INTEGER,
  CONSTRAINT vacancy_quantity_positive CHECK (quantity > 0),
  CONSTRAINT vacancy_operation_status_check CHECK (
    operation_status IN (
      'open', 'selected', 'requisition_sent', 'hired', 'closed', 'cancelled'
    )
  ),
  CONSTRAINT fk_vacancy_area FOREIGN KEY (area_id) REFERENCES ${refArea}(id),
  CONSTRAINT fk_vacancy_school FOREIGN KEY (school_id) REFERENCES ${refSchool}(id),
  CONSTRAINT fk_vacancy_program FOREIGN KEY (program_id) REFERENCES ${refProgram}(id)
);

ALTER TABLE vacancies.vacancy
  ADD COLUMN IF NOT EXISTS public_id BIGSERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_vacancy_public_id ON vacancies.vacancy(public_id);

CREATE INDEX IF NOT EXISTS idx_vacancy_area ON vacancies.vacancy(area_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_school ON vacancies.vacancy(school_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_created ON vacancies.vacancy(created_at DESC);

CREATE TABLE IF NOT EXISTS vacancies.requisition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id BIGSERIAL UNIQUE,
  vacancy_id UUID NOT NULL UNIQUE REFERENCES vacancies.vacancy(id) ON DELETE CASCADE,
  req_number VARCHAR(100) NOT NULL UNIQUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_to_capital_at TIMESTAMPTZ,
  capital_notes TEXT,
  shortlist_complied BOOLEAN,
  pda_complied BOOLEAN,
  contract_conditions_complied BOOLEAN,
  pre_interview_cv_complied BOOLEAN
);

ALTER TABLE vacancies.requisition
  ADD COLUMN IF NOT EXISTS public_id BIGSERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_requisition_public_id ON vacancies.requisition(public_id);

CREATE INDEX IF NOT EXISTS idx_requisition_vacancy ON vacancies.requisition(vacancy_id);

CREATE TABLE IF NOT EXISTS vacancies.vacancy_operation_note (
  id BIGSERIAL PRIMARY KEY,
  vacancy_id UUID NOT NULL REFERENCES vacancies.vacancy(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_person_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_von_vacancy_created
  ON vacancies.vacancy_operation_note(vacancy_id, created_at ASC);

CREATE TABLE IF NOT EXISTS vacancies.vacancy_status_history (
  id BIGSERIAL PRIMARY KEY,
  vacancy_id UUID NOT NULL REFERENCES vacancies.vacancy(id) ON DELETE CASCADE,
  previous_operation_status VARCHAR(40),
  new_operation_status VARCHAR(40) NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_person_id INTEGER
);

ALTER TABLE vacancies.vacancy_status_history
  ADD COLUMN IF NOT EXISTS vacancy_id UUID,
  ADD COLUMN IF NOT EXISTS previous_operation_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS new_operation_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS changed_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS changed_by_person_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_vsh_vacancy ON vacancies.vacancy_status_history(vacancy_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS vacancies.vacancy_change_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(100) NOT NULL DEFAULT 'vacancy',
  entity_id UUID NOT NULL REFERENCES vacancies.vacancy(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_person_id INTEGER,
  CONSTRAINT chk_vacancy_change_log_action CHECK (action IN ('INSERT', 'UPDATE', 'DELETE'))
);

ALTER TABLE vacancies.vacancy_change_log
  ADD COLUMN IF NOT EXISTS vacancy_id UUID REFERENCES vacancies.vacancy(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS entity_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(100) DEFAULT 'vacancy',
  ADD COLUMN IF NOT EXISTS entity_id UUID,
  ADD COLUMN IF NOT EXISTS action VARCHAR(40),
  ADD COLUMN IF NOT EXISTS details JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_by_person_id INTEGER;

UPDATE vacancies.vacancy_change_log
SET entity_id = COALESCE(entity_id, vacancy_id)
WHERE entity_id IS NULL AND vacancy_id IS NOT NULL;

UPDATE vacancies.vacancy_change_log
SET entity_type = COALESCE(NULLIF(TRIM(entity_type), ''), 'vacancy')
WHERE entity_type IS NULL OR TRIM(entity_type) = '';

CREATE INDEX IF NOT EXISTS idx_vcl_entity ON vacancies.vacancy_change_log(entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vcl_vacancy ON vacancies.vacancy_change_log(vacancy_id, created_at DESC);

CREATE OR REPLACE FUNCTION vacancies.touch_vacancy_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vacancies.log_vacancy_operation_status()
RETURNS TRIGGER AS $body$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.operation_status IS DISTINCT FROM NEW.operation_status) THEN
    INSERT INTO vacancies.vacancy_status_history (
      vacancy_id, previous_operation_status, new_operation_status
    ) VALUES (NEW.id, OLD.operation_status, NEW.operation_status);
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;

-- Legacy DBs: columnas previous_status / new_status junto a *_operation_*.
DO $migrate_log_op_status$
DECLARE
  has_previous_status boolean;
  has_new_status boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'vacancies'
      AND c.table_name = 'vacancy_status_history'
      AND c.column_name = 'previous_status'
  )
  INTO has_previous_status;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'vacancies'
      AND c.table_name = 'vacancy_status_history'
      AND c.column_name = 'new_status'
  )
  INTO has_new_status;

  IF has_previous_status AND has_new_status THEN
    EXECUTE $legacy_both_fn$
CREATE OR REPLACE FUNCTION vacancies.log_vacancy_operation_status()
RETURNS TRIGGER AS $body$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.operation_status IS DISTINCT FROM NEW.operation_status) THEN
    INSERT INTO vacancies.vacancy_status_history (
      vacancy_id,
      previous_operation_status,
      new_operation_status,
      previous_status,
      new_status
    ) VALUES (
      NEW.id,
      OLD.operation_status,
      NEW.operation_status,
      OLD.operation_status,
      NEW.operation_status
    );
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;
$legacy_both_fn$;
    EXECUTE $legacy_both_bf$
UPDATE vacancies.vacancy_status_history h
SET
  previous_status = COALESCE(h.previous_status, h.previous_operation_status),
  new_status = COALESCE(h.new_status, h.new_operation_status)
WHERE (h.new_operation_status IS NOT NULL AND h.new_status IS NULL)
   OR (h.previous_operation_status IS NOT NULL AND h.previous_status IS NULL);
$legacy_both_bf$;
  ELSIF has_new_status THEN
    EXECUTE $legacy_new_fn$
CREATE OR REPLACE FUNCTION vacancies.log_vacancy_operation_status()
RETURNS TRIGGER AS $body$
BEGIN
  IF TG_OP = 'UPDATE' AND (OLD.operation_status IS DISTINCT FROM NEW.operation_status) THEN
    INSERT INTO vacancies.vacancy_status_history (
      vacancy_id,
      previous_operation_status,
      new_operation_status,
      new_status
    ) VALUES (
      NEW.id,
      OLD.operation_status,
      NEW.operation_status,
      NEW.operation_status
    );
  END IF;
  RETURN NEW;
END;
$body$ LANGUAGE plpgsql;
$legacy_new_fn$;
    EXECUTE $legacy_new_bf$
UPDATE vacancies.vacancy_status_history h
SET new_status = COALESCE(h.new_status, h.new_operation_status)
WHERE h.new_operation_status IS NOT NULL AND h.new_status IS NULL;
$legacy_new_bf$;
  END IF;
END $migrate_log_op_status$;
`;
}

/**
 * Evolución idempotente para bases que ya tenían vacancy.operation_notes /
 * vacancy.capital_notes antes del modelo con vacancy_operation_note y
 * requisition.capital_notes.
 */
/** Cumplimientos (terna, PDA, etc.) viven en requisition, no en vacancy. */
async function upgradeRequisitionComplianceColumns(): Promise<void> {
  await pool.query(
    `ALTER TABLE vacancies.requisition
       ADD COLUMN IF NOT EXISTS shortlist_complied BOOLEAN,
       ADD COLUMN IF NOT EXISTS pda_complied BOOLEAN,
       ADD COLUMN IF NOT EXISTS contract_conditions_complied BOOLEAN,
       ADD COLUMN IF NOT EXISTS pre_interview_cv_complied BOOLEAN`
  );

  await pool.query(`
DO $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'vacancies'
      AND c.table_name = 'vacancy'
      AND c.column_name = 'shortlist_complied'
  ) THEN
    UPDATE vacancies.requisition r
    SET
      shortlist_complied = COALESCE(r.shortlist_complied, v.shortlist_complied),
      pda_complied = COALESCE(r.pda_complied, v.pda_complied),
      contract_conditions_complied = COALESCE(
        r.contract_conditions_complied, v.contract_conditions_complied
      ),
      pre_interview_cv_complied = COALESCE(
        r.pre_interview_cv_complied, v.pre_interview_cv_complied
      )
    FROM vacancies.vacancy v
    WHERE r.vacancy_id = v.id
      AND (
        v.shortlist_complied IS NOT NULL
        OR v.pda_complied IS NOT NULL
        OR v.contract_conditions_complied IS NOT NULL
        OR v.pre_interview_cv_complied IS NOT NULL
      );
  END IF;
END
$body$;
`);

  await pool.query(`
ALTER TABLE vacancies.vacancy
  DROP COLUMN IF EXISTS shortlist_complied,
  DROP COLUMN IF EXISTS pda_complied,
  DROP COLUMN IF EXISTS contract_conditions_complied,
  DROP COLUMN IF EXISTS pre_interview_cv_complied
`);
}

async function upgradeVacanciesLegacyColumns(): Promise<void> {
  await pool.query(
    `ALTER TABLE vacancies.requisition
       ADD COLUMN IF NOT EXISTS capital_notes TEXT`
  );

  await pool.query(`
DO $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'vacancies'
      AND c.table_name = 'vacancy'
      AND c.column_name = 'capital_notes'
  ) THEN
    UPDATE vacancies.requisition r
    SET capital_notes = COALESCE(
      NULLIF(btrim(COALESCE(r.capital_notes::text, '')), ''),
      NULLIF(btrim(v.capital_notes::text), '')
    )
    FROM vacancies.vacancy v
    WHERE r.vacancy_id = v.id
      AND v.capital_notes IS NOT NULL
      AND btrim(v.capital_notes::text) <> '';
  END IF;
END
$body$;
`);

  await pool.query(`
DO $body$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'vacancies'
      AND c.table_name = 'vacancy'
      AND c.column_name = 'operation_notes'
  ) THEN
    INSERT INTO vacancies.vacancy_operation_note (
      vacancy_id, body, created_at, created_by_person_id
    )
    SELECT
      v.id,
      btrim(v.operation_notes::text),
      COALESCE(v.updated_at, v.created_at),
      NULL
    FROM vacancies.vacancy v
    WHERE v.operation_notes IS NOT NULL
      AND btrim(v.operation_notes::text) <> ''
      AND NOT EXISTS (
        SELECT 1
        FROM vacancies.vacancy_operation_note n
        WHERE n.vacancy_id = v.id
      );
  END IF;
END
$body$;
`);

  await pool.query(`
ALTER TABLE vacancies.vacancy
  DROP COLUMN IF EXISTS capital_notes,
  DROP COLUMN IF EXISTS operation_notes
`);

  await pool.query(
    `ALTER TABLE vacancies.vacancy ALTER COLUMN school_id DROP NOT NULL`
  );
}

async function createTriggerExecute(
  triggerSqlFunction: string,
  triggerSqlProcedure: string
): Promise<void> {
  try {
    await pool.query(triggerSqlFunction);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("syntax error") ||
      msg.includes("42809") ||
      msg.includes("EXECUTE FUNCTION")
    ) {
      await pool.query(triggerSqlProcedure);
    } else {
      throw e;
    }
  }
}

export async function migrateVacancies(): Promise<void> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) {
    throw new Error(
      "migrate_vacancies: no se encontraron tablas area/school/program en " +
        "`public` ni `core`. Crea el esquema core o ejecuta migrate:core antes."
    );
  }

  console.log(
    `Executing vacancies schema migration (FKs contra ${mode}.area/school/program)...`
  );
  try {
    await pool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
  } catch (e) {
    console.warn(
      "migrate_vacancies: CREATE EXTENSION pgcrypto omitido o falló (¿permisos?). " +
        "Si falla gen_random_uuid(), concede la extensión o usa PostgreSQL 13+ con pgcrypto.",
      e
    );
  }
  await pool.query(buildVacanciesDdl(mode));
  await upgradeVacanciesLegacyColumns();
  await upgradeRequisitionComplianceColumns();

  await pool.query(
    `DROP TRIGGER IF EXISTS trg_vacancy_touch_updated ON vacancies.vacancy`
  );
  await createTriggerExecute(
    `CREATE TRIGGER trg_vacancy_touch_updated
       BEFORE UPDATE ON vacancies.vacancy
       FOR EACH ROW
       EXECUTE FUNCTION vacancies.touch_vacancy_updated_at()`,
    `CREATE TRIGGER trg_vacancy_touch_updated
       BEFORE UPDATE ON vacancies.vacancy
       FOR EACH ROW
       EXECUTE PROCEDURE vacancies.touch_vacancy_updated_at()`
  );

  await pool.query(
    `DROP TRIGGER IF EXISTS trg_vacancy_status_history ON vacancies.vacancy`
  );
  await createTriggerExecute(
    `CREATE TRIGGER trg_vacancy_status_history
       AFTER UPDATE ON vacancies.vacancy
       FOR EACH ROW
       EXECUTE FUNCTION vacancies.log_vacancy_operation_status()`,
    `CREATE TRIGGER trg_vacancy_status_history
       AFTER UPDATE ON vacancies.vacancy
       FOR EACH ROW
       EXECUTE PROCEDURE vacancies.log_vacancy_operation_status()`
  );

  console.log("✓ vacancies schema migration completed");
}

async function main(): Promise<void> {
  try {
    await migrateVacancies();
  } catch (error) {
    console.error("✗ vacancies schema migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
