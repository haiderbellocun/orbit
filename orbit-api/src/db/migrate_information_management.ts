import { pool } from "./connection";

const sql = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS information_management;

CREATE TABLE IF NOT EXISTS information_management.project (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_project_id TEXT,
  name VARCHAR(240) NOT NULL,
  description TEXT,
  area_id INTEGER NOT NULL,
  zoho_owner_name VARCHAR(240),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  start_date DATE,
  end_date DATE,
  archived_at TIMESTAMPTZ,
  archived_by_person_id INTEGER,
  archive_reason TEXT,
  created_by_person_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_information_project_zoho_id
  ON information_management.project (zoho_project_id)
  WHERE zoho_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_information_project_area_status
  ON information_management.project (area_id, status) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_information_project_created_at
  ON information_management.project (created_at DESC);

CREATE TABLE IF NOT EXISTS information_management.task (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES information_management.project(id),
  parent_task_id UUID REFERENCES information_management.task(id),
  zoho_task_id TEXT,
  name VARCHAR(300) NOT NULL,
  description TEXT,
  zoho_owner_name VARCHAR(240),
  zoho_status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (zoho_status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  review_status VARCHAR(32) NOT NULL DEFAULT 'unreviewed'
    CHECK (review_status IN ('unreviewed', 'pending_correction', 'correct')),
  completion_percentage INTEGER NOT NULL DEFAULT 0
    CHECK (completion_percentage BETWEEN 0 AND 100),
  priority VARCHAR(16) NOT NULL DEFAULT 'medium'
    CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  start_date DATE,
  due_date DATE,
  archived_at TIMESTAMPTZ,
  archived_by_person_id INTEGER,
  archive_reason TEXT,
  created_by_person_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (due_date IS NULL OR start_date IS NULL OR due_date >= start_date),
  CHECK (parent_task_id IS NULL OR parent_task_id <> id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_information_task_zoho_id
  ON information_management.task (zoho_task_id)
  WHERE zoho_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_information_task_project
  ON information_management.task (project_id, parent_task_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_information_task_review
  ON information_management.task (review_status, due_date) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS information_management.incident (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES information_management.task(id),
  description TEXT NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'resolved')),
  observed_at TIMESTAMPTZ NOT NULL,
  resolution_note TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by_person_id INTEGER,
  created_by_person_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_information_incident_task
  ON information_management.incident (task_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS information_management.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES information_management.incident(id),
  storage_key TEXT NOT NULL UNIQUE,
  original_filename VARCHAR(500) NOT NULL,
  mime_type VARCHAR(160) NOT NULL,
  file_size BIGINT NOT NULL CHECK (file_size > 0 AND file_size <= 26214400),
  file_hash CHAR(64) NOT NULL,
  description TEXT,
  evidence_at TIMESTAMPTZ NOT NULL,
  uploaded_by_person_id INTEGER NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  voided_at TIMESTAMPTZ,
  voided_by_person_id INTEGER,
  void_reason TEXT
);
CREATE INDEX IF NOT EXISTS ix_information_evidence_incident
  ON information_management.evidence (incident_id, uploaded_at DESC);

-- Identificadores consecutivos para UI, reportes y tableros. Los UUID se
-- conservan como claves internas para no romper relaciones ni objetos de GCS.
CREATE SEQUENCE IF NOT EXISTS information_management.project_public_id_seq;
ALTER TABLE information_management.project
  ADD COLUMN IF NOT EXISTS public_id BIGINT;
ALTER TABLE information_management.project
  ALTER COLUMN public_id SET DEFAULT nextval('information_management.project_public_id_seq');
UPDATE information_management.project
SET public_id = nextval('information_management.project_public_id_seq')
WHERE public_id IS NULL;
SELECT setval(
  'information_management.project_public_id_seq',
  GREATEST(COALESCE((SELECT MAX(public_id) FROM information_management.project), 0), 1),
  EXISTS (SELECT 1 FROM information_management.project)
);
ALTER TABLE information_management.project ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_information_project_public_id
  ON information_management.project (public_id);

CREATE SEQUENCE IF NOT EXISTS information_management.task_public_id_seq;
ALTER TABLE information_management.task
  ADD COLUMN IF NOT EXISTS public_id BIGINT;
ALTER TABLE information_management.task
  ALTER COLUMN public_id SET DEFAULT nextval('information_management.task_public_id_seq');
UPDATE information_management.task
SET public_id = nextval('information_management.task_public_id_seq')
WHERE public_id IS NULL;
SELECT setval(
  'information_management.task_public_id_seq',
  GREATEST(COALESCE((SELECT MAX(public_id) FROM information_management.task), 0), 1),
  EXISTS (SELECT 1 FROM information_management.task)
);
ALTER TABLE information_management.task ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_information_task_public_id
  ON information_management.task (public_id);

CREATE SEQUENCE IF NOT EXISTS information_management.incident_public_id_seq;
ALTER TABLE information_management.incident
  ADD COLUMN IF NOT EXISTS public_id BIGINT;
ALTER TABLE information_management.incident
  ALTER COLUMN public_id SET DEFAULT nextval('information_management.incident_public_id_seq');
UPDATE information_management.incident
SET public_id = nextval('information_management.incident_public_id_seq')
WHERE public_id IS NULL;
SELECT setval(
  'information_management.incident_public_id_seq',
  GREATEST(COALESCE((SELECT MAX(public_id) FROM information_management.incident), 0), 1),
  EXISTS (SELECT 1 FROM information_management.incident)
);
ALTER TABLE information_management.incident ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_information_incident_public_id
  ON information_management.incident (public_id);

CREATE SEQUENCE IF NOT EXISTS information_management.evidence_public_id_seq;
ALTER TABLE information_management.evidence
  ADD COLUMN IF NOT EXISTS public_id BIGINT;
ALTER TABLE information_management.evidence
  ALTER COLUMN public_id SET DEFAULT nextval('information_management.evidence_public_id_seq');
UPDATE information_management.evidence
SET public_id = nextval('information_management.evidence_public_id_seq')
WHERE public_id IS NULL;
SELECT setval(
  'information_management.evidence_public_id_seq',
  GREATEST(COALESCE((SELECT MAX(public_id) FROM information_management.evidence), 0), 1),
  EXISTS (SELECT 1 FROM information_management.evidence)
);
ALTER TABLE information_management.evidence ALTER COLUMN public_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_information_evidence_public_id
  ON information_management.evidence (public_id);

CREATE TABLE IF NOT EXISTS information_management.audit_log (
  id BIGSERIAL PRIMARY KEY,
  entity_type VARCHAR(24) NOT NULL,
  entity_id UUID NOT NULL,
  action VARCHAR(24) NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  performed_by_person_id INTEGER NOT NULL,
  performed_by_email VARCHAR(320) NOT NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_information_audit_entity
  ON information_management.audit_log (entity_type, entity_id, performed_at DESC);
`;

export async function migrateInformationManagement(): Promise<void> {
  await pool.query(sql);
  console.log("migrate_information_management: OK");
}

if (require.main === module) {
  migrateInformationManagement()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error("migrate_information_management failed:", error);
      await pool.end();
      process.exitCode = 1;
    });
}
