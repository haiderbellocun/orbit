import { pool } from "./connection";
import { resolveCoreSchemaMode, type CoreSchemaMode } from "../lib/coreSchema";

function buildWorkforceEventsDdl(coreSchema: CoreSchemaMode): string {
  const personT = coreSchema === "core" ? "core.person" : "public.person";

  return `
CREATE SCHEMA IF NOT EXISTS workforce_events;

CREATE TABLE IF NOT EXISTS workforce_events.event_type (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workforce_events.event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type_id BIGINT NOT NULL,
  observation TEXT,
  created_by_person_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL,
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  status VARCHAR(20) NOT NULL DEFAULT 'NOT_TAKEN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT event_status_check CHECK (
    status IN (
      'PENDING', 'APPROVED', 'REJECTED', 'TAKEN', 'NOT_TAKEN', 'CANCELLED'
    )
  ),
  CONSTRAINT event_date_range_check CHECK (
    start_date IS NULL
    OR end_date IS NULL
    OR end_date >= start_date
  ),
  CONSTRAINT fk_event_event_type
    FOREIGN KEY (event_type_id) REFERENCES workforce_events.event_type(id),
  CONSTRAINT fk_event_created_by_person
    FOREIGN KEY (created_by_person_id) REFERENCES ${personT}(id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_event_person
    FOREIGN KEY (person_id) REFERENCES ${personT}(id)
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_event_status ON workforce_events.event(status);
CREATE INDEX IF NOT EXISTS idx_event_type ON workforce_events.event(event_type_id);
CREATE INDEX IF NOT EXISTS idx_event_created ON workforce_events.event(created_at DESC);

CREATE OR REPLACE FUNCTION workforce_events.touch_event_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION workforce_events.touch_event_type_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;
}

const SEED_EVENT_TYPES = [
  { name: "LICENCIA", description: "Licencias" },
  { name: "PERMISO", description: "Permisos (seguimiento tomado / no tomado)" },
  { name: "SANCION", description: "Sanciones" },
  { name: "INCAPACIDAD", description: "Incapacidades médicas" },
  { name: "OTRO", description: "Otras novedades" },
] as const;

async function createTriggerExecute(
  pg14Sql: string,
  legacySql: string
): Promise<void> {
  try {
    await pool.query(pg14Sql);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes("EXECUTE FUNCTION") && !msg.includes("syntax error")) {
      throw e;
    }
    await pool.query(legacySql);
  }
}

/** Bases creadas con el nombre anterior `affected_person_id`. */
async function upgradeRenameAffectedPersonColumn(): Promise<void> {
  const col = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'workforce_events'
       AND table_name = 'event'
       AND column_name IN ('affected_person_id', 'person_id')`
  );
  const names = new Set(
    (col.rows as { column_name: string }[]).map((r) => r.column_name)
  );
  if (!names.has("affected_person_id") || names.has("person_id")) return;

  await pool.query(
    `ALTER TABLE workforce_events.event
       RENAME COLUMN affected_person_id TO person_id`
  );
  await pool.query(
    `ALTER INDEX IF EXISTS workforce_events.idx_event_affected_created
       RENAME TO idx_event_person_created`
  ).catch(() => undefined);
  await pool.query(
    `ALTER TABLE workforce_events.event
       RENAME CONSTRAINT fk_event_affected_person TO fk_event_person`
  ).catch(() => undefined);
}

/** Reemplaza `quantity` / `quantity_unit` por fechas y horas. */
async function upgradeQuantityToScheduleColumns(): Promise<void> {
  const col = await pool.query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'workforce_events'
       AND table_name = 'event'
       AND column_name IN (
         'quantity', 'quantity_unit',
         'start_date', 'end_date', 'start_time', 'end_time'
       )`
  );
  const names = new Set(
    (col.rows as { column_name: string }[]).map((r) => r.column_name)
  );

  if (names.has("quantity") || names.has("quantity_unit")) {
    await pool.query(
      `ALTER TABLE workforce_events.event
         DROP CONSTRAINT IF EXISTS event_quantity_unit_check`
    );
    await pool.query(
      `ALTER TABLE workforce_events.event
         DROP CONSTRAINT IF EXISTS event_quantity_consistency_check`
    );
    await pool.query(
      `ALTER TABLE workforce_events.event DROP COLUMN IF EXISTS quantity`
    );
    await pool.query(
      `ALTER TABLE workforce_events.event DROP COLUMN IF EXISTS quantity_unit`
    );
  }

  await pool.query(
    `ALTER TABLE workforce_events.event
       ADD COLUMN IF NOT EXISTS start_date DATE,
       ADD COLUMN IF NOT EXISTS end_date DATE,
       ADD COLUMN IF NOT EXISTS start_time TIME,
       ADD COLUMN IF NOT EXISTS end_time TIME`
  );

  await pool.query(
    `ALTER TABLE workforce_events.event
       DROP CONSTRAINT IF EXISTS event_date_range_check`
  );
  await pool.query(
    `ALTER TABLE workforce_events.event
       ADD CONSTRAINT event_date_range_check CHECK (
         start_date IS NULL
         OR end_date IS NULL
         OR end_date >= start_date
       )`
  ).catch(() => undefined);
}

export async function migrateWorkforceEvents(): Promise<void> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) {
    throw new Error(
      "CORE person table is not available (core.person or public.person)"
    );
  }

  await pool.query(buildWorkforceEventsDdl(mode));
  await upgradeRenameAffectedPersonColumn();
  await upgradeQuantityToScheduleColumns();
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_event_person_created
       ON workforce_events.event(person_id, created_at DESC)`
  );

  for (const row of SEED_EVENT_TYPES) {
    await pool.query(
      `INSERT INTO workforce_events.event_type (name, description)
       VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [row.name, row.description]
    );
  }

  await pool.query(
    `DROP TRIGGER IF EXISTS trg_event_touch_updated ON workforce_events.event`
  );
  await createTriggerExecute(
    `CREATE TRIGGER trg_event_touch_updated
       BEFORE UPDATE ON workforce_events.event
       FOR EACH ROW
       EXECUTE FUNCTION workforce_events.touch_event_updated_at()`,
    `CREATE TRIGGER trg_event_touch_updated
       BEFORE UPDATE ON workforce_events.event
       FOR EACH ROW
       EXECUTE PROCEDURE workforce_events.touch_event_updated_at()`
  );

  await pool.query(
    `DROP TRIGGER IF EXISTS trg_event_type_touch_updated ON workforce_events.event_type`
  );
  await createTriggerExecute(
    `CREATE TRIGGER trg_event_type_touch_updated
       BEFORE UPDATE ON workforce_events.event_type
       FOR EACH ROW
       EXECUTE FUNCTION workforce_events.touch_event_type_updated_at()`,
    `CREATE TRIGGER trg_event_type_touch_updated
       BEFORE UPDATE ON workforce_events.event_type
       FOR EACH ROW
       EXECUTE PROCEDURE workforce_events.touch_event_type_updated_at()`
  );

  console.log("✓ workforce_events schema migration completed");
}

async function main(): Promise<void> {
  try {
    await migrateWorkforceEvents();
  } catch (error) {
    console.error("✗ workforce_events schema migration failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
