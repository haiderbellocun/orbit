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
  area_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  program_id INTEGER,
  position_name VARCHAR(255) NOT NULL,
  curricular_line VARCHAR(500),
  quantity INTEGER NOT NULL,
  operation_notes TEXT,
  capital_notes TEXT,
  shortlist_complied BOOLEAN,
  pda_complied BOOLEAN,
  contract_conditions_complied BOOLEAN,
  pre_interview_cv_complied BOOLEAN,
  operation_status VARCHAR(40) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
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

CREATE INDEX IF NOT EXISTS idx_vacancy_area ON vacancies.vacancy(area_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_school ON vacancies.vacancy(school_id);
CREATE INDEX IF NOT EXISTS idx_vacancy_created ON vacancies.vacancy(created_at DESC);

CREATE TABLE IF NOT EXISTS vacancies.requisition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vacancy_id UUID NOT NULL UNIQUE REFERENCES vacancies.vacancy(id) ON DELETE CASCADE,
  req_number VARCHAR(100) NOT NULL UNIQUE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_to_capital_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_requisition_vacancy ON vacancies.requisition(vacancy_id);

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
