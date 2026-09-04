import { pool } from "./connection";

/**
 * Histórico de carga académica: import_run + academic_load_snapshot (particionado)
 * + staging + funciones/vistas as-of.
 *
 * Ver: docs/historico-carga-academica-spec.md
 */
async function migrateAcademicLoadHistory(): Promise<void> {
  const year = new Date().getFullYear();
  const nextYear = year + 1;

  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS academic_workload;

    -- ============================================================
    -- Bitácora de corridas
    -- ============================================================
    CREATE TABLE IF NOT EXISTS academic_workload.import_run (
      id                bigserial PRIMARY KEY,
      imported_at       timestamptz NOT NULL DEFAULT now(),
      fecha_carga       date GENERATED ALWAYS AS
                          (((imported_at AT TIME ZONE 'America/Bogota'))::date) STORED,
      snapshot_type     text        NOT NULL DEFAULT 'adhoc'
                          CHECK (snapshot_type IN ('daily_1700','adhoc','recovery')),
      is_official       boolean     NOT NULL DEFAULT false,
      source_file       text,
      source_file_size  bigint,
      content_hash      text,
      has_changes       boolean,
      period_codes      text[],
      row_count         integer,
      added             integer,
      removed           integer,
      changed           integer,
      status            text        NOT NULL DEFAULT 'running'
                          CHECK (status IN ('running','ok','failed','dry_run')),
      error_message     text,
      duration_ms       integer,
      imported_by       text,
      app_version       text
    );

    CREATE UNIQUE INDEX IF NOT EXISTS uq_import_run_oficial_dia
      ON academic_workload.import_run (fecha_carga)
      WHERE is_official AND status = 'ok';

    CREATE INDEX IF NOT EXISTS ix_import_run_imported_at
      ON academic_workload.import_run (imported_at DESC);

    CREATE INDEX IF NOT EXISTS ix_import_run_status
      ON academic_workload.import_run (status, imported_at DESC);

    -- ============================================================
    -- Foto histórica (particionada por año en fecha_carga)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS academic_workload.academic_load_snapshot (
      id                          bigserial,
      import_run_id               bigint      NOT NULL
        REFERENCES academic_workload.import_run(id) ON DELETE RESTRICT,
      fecha_carga                 date        NOT NULL,

      person_id                   bigint,
      teacher_full_name           text,
      subject_code                text,
      subject_name                text,
      group_code                  text,
      aca_group_id                text,
      period_code                 text,
      semester                    text,
      program_id                  bigint,
      program_name                text,
      enrolled_quantity           integer,
      substantive_hours_quantity  numeric(8,2),
      region_id                   bigint,
      region_name                 text,
      city_id                     bigint,
      city_name                   text,
      campus_id                   bigint,
      campus_name                 text,
      class_preparation_id        bigint,

      row_hash                    bytea,

      PRIMARY KEY (id, fecha_carga)
    ) PARTITION BY RANGE (fecha_carga);

    CREATE TABLE IF NOT EXISTS academic_workload.academic_load_snapshot_${year}
      PARTITION OF academic_workload.academic_load_snapshot
      FOR VALUES FROM ('${year}-01-01') TO ('${nextYear}-01-01');

    CREATE TABLE IF NOT EXISTS academic_workload.academic_load_snapshot_default
      PARTITION OF academic_workload.academic_load_snapshot DEFAULT;

    CREATE INDEX IF NOT EXISTS ix_als_run_person
      ON academic_workload.academic_load_snapshot (import_run_id, person_id);
    CREATE INDEX IF NOT EXISTS ix_als_run_period
      ON academic_workload.academic_load_snapshot (import_run_id, period_code);
    CREATE INDEX IF NOT EXISTS ix_als_person_fecha
      ON academic_workload.academic_load_snapshot (person_id, fecha_carga);

    COMMENT ON TABLE academic_workload.academic_load_snapshot IS
      'Histórico inmutable (append-only). Sin FK hacia catálogos operativos.';

    -- ============================================================
    -- Staging (truncate por corrida)
    -- ============================================================
    CREATE TABLE IF NOT EXISTS academic_workload.academic_load_stg (
      person_id                   integer NOT NULL,
      period_code                 varchar(50) NOT NULL,
      semester                    varchar(50),
      program_id                  integer,
      program_name                varchar(250),
      subject_code                varchar(50) NOT NULL,
      group_code                  varchar(50) NOT NULL,
      aca_group_id                varchar(50),
      enrolled_quantity           integer DEFAULT 0 NOT NULL,
      region_id                   integer,
      city_id                     integer,
      campus_id                   integer,
      substantive_category_id     integer,
      substantive_hours_quantity  numeric(6,2) DEFAULT 0 NOT NULL,
      class_preparation_id        integer,
      teacher_full_name           text,
      subject_name                text,
      region_name                 text,
      city_name                   text,
      campus_name                 text,
      row_hash                    bytea
    );

    CREATE INDEX IF NOT EXISTS ix_als_stg_biz
      ON academic_workload.academic_load_stg (
        period_code, subject_code, group_code, person_id, aca_group_id
      );

    -- ============================================================
    -- Consulta as-of
    -- ============================================================
    CREATE OR REPLACE FUNCTION academic_workload.f_run_as_of(p_momento timestamptz)
    RETURNS bigint
    LANGUAGE sql
    STABLE
    AS $$
      SELECT id
      FROM academic_workload.import_run
      WHERE status = 'ok' AND is_official AND imported_at <= p_momento
      ORDER BY imported_at DESC
      LIMIT 1;
    $$;

    CREATE OR REPLACE VIEW academic_workload.v_ultimo_corte AS
    SELECT s.*
    FROM academic_workload.academic_load_snapshot s
    WHERE s.import_run_id = (
      SELECT id FROM academic_workload.import_run
      WHERE status = 'ok' AND is_official
      ORDER BY imported_at DESC
      LIMIT 1
    );
  `);

  console.log("Migración academic_load history completada");
  await pool.end();
}

migrateAcademicLoadHistory().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
