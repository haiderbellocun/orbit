import { pool } from "./connection";

/**
 * Renombra el esquema substantive_hours para reflejar el modelo por docente:
 * - project → category (catálogo)
 * - person_assignment → assignment
 * - person_assignment_task → assignment_task
 * - Elimina substantive_function (legacy, sin uso)
 * - academic_load.project_id → substantive_category_id
 */
async function migrateSubstantiveHoursRename(): Promise<void> {
  await pool.query(`
    DROP TABLE IF EXISTS substantive_hours.substantive_function CASCADE;
    DROP SEQUENCE IF EXISTS substantive_hours.substantive_function_id_seq;
  `);

  await pool.query(`
    DO $do$
    BEGIN
      IF to_regclass('substantive_hours.project') IS NOT NULL
         AND to_regclass('substantive_hours.category') IS NULL THEN
        ALTER TABLE substantive_hours.project RENAME TO category;
      END IF;

      IF to_regclass('substantive_hours.project_id_seq') IS NOT NULL
         AND to_regclass('substantive_hours.category_id_seq') IS NULL THEN
        ALTER SEQUENCE substantive_hours.project_id_seq RENAME TO category_id_seq;
      END IF;

      IF to_regclass('substantive_hours.category') IS NOT NULL THEN
        ALTER TABLE substantive_hours.category
          ALTER COLUMN id SET DEFAULT nextval('substantive_hours.category_id_seq'::regclass);
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'project_pkey'
          AND conrelid = 'substantive_hours.category'::regclass
      ) THEN
        ALTER TABLE substantive_hours.category
          RENAME CONSTRAINT project_pkey TO category_pkey;
      END IF;
    END
    $do$;
  `);

  await pool.query(`
    DO $do$
    BEGIN
      IF to_regclass('substantive_hours.person_assignment') IS NOT NULL
         AND to_regclass('substantive_hours.assignment') IS NULL THEN
        ALTER TABLE substantive_hours.person_assignment RENAME TO assignment;
      END IF;

      IF to_regclass('substantive_hours.person_assignment_id_seq') IS NOT NULL
         AND to_regclass('substantive_hours.assignment_id_seq') IS NULL THEN
        ALTER SEQUENCE substantive_hours.person_assignment_id_seq
          RENAME TO assignment_id_seq;
      END IF;

      IF to_regclass('substantive_hours.assignment') IS NOT NULL THEN
        ALTER TABLE substantive_hours.assignment
          ALTER COLUMN id SET DEFAULT nextval('substantive_hours.assignment_id_seq'::regclass);
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'person_assignment_pkey'
          AND conrelid = 'substantive_hours.assignment'::regclass
      ) THEN
        ALTER TABLE substantive_hours.assignment
          RENAME CONSTRAINT person_assignment_pkey TO assignment_pkey;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_person_assignment_hours'
          AND conrelid = 'substantive_hours.assignment'::regclass
      ) THEN
        ALTER TABLE substantive_hours.assignment
          RENAME CONSTRAINT chk_person_assignment_hours TO chk_assignment_hours;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_person_assignment_category'
      ) THEN
        ALTER TABLE substantive_hours.assignment
          RENAME CONSTRAINT fk_person_assignment_category TO fk_assignment_category;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_person_assignment_person'
      ) THEN
        ALTER TABLE substantive_hours.assignment
          RENAME CONSTRAINT fk_person_assignment_person TO fk_assignment_person;
      END IF;

      IF to_regclass('substantive_hours.idx_person_assignment_person_id') IS NOT NULL
         AND to_regclass('substantive_hours.idx_assignment_person_id') IS NULL THEN
        ALTER INDEX substantive_hours.idx_person_assignment_person_id
          RENAME TO idx_assignment_person_id;
      END IF;
    END
    $do$;
  `);

  await pool.query(`
    DO $do$
    BEGIN
      IF to_regclass('substantive_hours.person_assignment_task') IS NOT NULL
         AND to_regclass('substantive_hours.assignment_task') IS NULL THEN
        ALTER TABLE substantive_hours.person_assignment_task RENAME TO assignment_task;
      END IF;

      IF to_regclass('substantive_hours.person_assignment_task_id_seq') IS NOT NULL
         AND to_regclass('substantive_hours.assignment_task_id_seq') IS NULL THEN
        ALTER SEQUENCE substantive_hours.person_assignment_task_id_seq
          RENAME TO assignment_task_id_seq;
      END IF;

      IF to_regclass('substantive_hours.assignment_task') IS NOT NULL THEN
        ALTER TABLE substantive_hours.assignment_task
          ALTER COLUMN id SET DEFAULT nextval('substantive_hours.assignment_task_id_seq'::regclass);
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'person_assignment_task_pkey'
          AND conrelid = 'substantive_hours.assignment_task'::regclass
      ) THEN
        ALTER TABLE substantive_hours.assignment_task
          RENAME CONSTRAINT person_assignment_task_pkey TO assignment_task_pkey;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_person_assignment_task_assignment'
      ) THEN
        ALTER TABLE substantive_hours.assignment_task
          RENAME CONSTRAINT fk_person_assignment_task_assignment
          TO fk_assignment_task_assignment;
      END IF;

      IF to_regclass('substantive_hours.idx_person_assignment_task_assignment_id') IS NOT NULL
         AND to_regclass('substantive_hours.idx_assignment_task_assignment_id') IS NULL THEN
        ALTER INDEX substantive_hours.idx_person_assignment_task_assignment_id
          RENAME TO idx_assignment_task_assignment_id;
      END IF;
    END
    $do$;
  `);

  await pool.query(`
    DO $do$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academic_workload'
          AND table_name = 'academic_load'
          AND column_name = 'project_id'
      ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'academic_workload'
          AND table_name = 'academic_load'
          AND column_name = 'substantive_category_id'
      ) THEN
        ALTER TABLE academic_workload.academic_load
          RENAME COLUMN project_id TO substantive_category_id;
      END IF;

      IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_academic_load_project'
      ) THEN
        ALTER TABLE academic_workload.academic_load
          DROP CONSTRAINT fk_academic_load_project;
      END IF;

      IF to_regclass('substantive_hours.category') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'fk_academic_load_substantive_category'
         ) THEN
        ALTER TABLE academic_workload.academic_load
          ADD CONSTRAINT fk_academic_load_substantive_category
          FOREIGN KEY (substantive_category_id)
          REFERENCES substantive_hours.category(id)
          ON UPDATE CASCADE ON DELETE SET NULL;
      END IF;
    END
    $do$;
  `);

  console.log("Migración substantive_hours (rename) completada");
  await pool.end();
}

migrateSubstantiveHoursRename().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
