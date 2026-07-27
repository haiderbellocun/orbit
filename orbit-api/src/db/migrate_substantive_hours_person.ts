import { pool } from "./connection";

/**
 * Horas sustantivas por docente.
 * - `category`: catálogo de categorías.
 * - `assignment` + `assignment_task`: asignaciones operativas por docente.
 */
async function migrateSubstantiveHoursPerson(): Promise<void> {
  await pool.query(`
    CREATE SCHEMA IF NOT EXISTS substantive_hours;

    CREATE SEQUENCE IF NOT EXISTS substantive_hours.category_id_seq;
    CREATE SEQUENCE IF NOT EXISTS substantive_hours.assignment_id_seq;
    CREATE SEQUENCE IF NOT EXISTS substantive_hours.assignment_task_id_seq;

    CREATE TABLE IF NOT EXISTS substantive_hours.category (
      id integer DEFAULT nextval('substantive_hours.category_id_seq'::regclass) NOT NULL,
      name character varying(200) NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      created_at timestamp without time zone DEFAULT now() NOT NULL,
      updated_at timestamp without time zone DEFAULT now() NOT NULL,
      CONSTRAINT category_pkey PRIMARY KEY (id)
    );

    CREATE TABLE IF NOT EXISTS substantive_hours.assignment (
      id integer DEFAULT nextval('substantive_hours.assignment_id_seq'::regclass) NOT NULL,
      person_id bigint NOT NULL,
      category_id integer NULL,
      hours_quantity integer NOT NULL,
      created_at timestamp without time zone DEFAULT now() NOT NULL,
      updated_at timestamp without time zone DEFAULT now() NOT NULL,
      CONSTRAINT assignment_pkey PRIMARY KEY (id),
      CONSTRAINT chk_assignment_hours CHECK (hours_quantity >= 1)
    );

    CREATE TABLE IF NOT EXISTS substantive_hours.assignment_task (
      id integer DEFAULT nextval('substantive_hours.assignment_task_id_seq'::regclass) NOT NULL,
      assignment_id integer NOT NULL,
      description text NOT NULL,
      sort_order integer DEFAULT 0 NOT NULL,
      created_at timestamp without time zone DEFAULT now() NOT NULL,
      CONSTRAINT assignment_task_pkey PRIMARY KEY (id)
    );
  `);

  await pool.query(`
    DO $do$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_assignment_category'
      ) THEN
        ALTER TABLE substantive_hours.assignment
          ADD CONSTRAINT fk_assignment_category
          FOREIGN KEY (category_id)
          REFERENCES substantive_hours.category(id)
          ON UPDATE CASCADE ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fk_assignment_task_assignment'
      ) THEN
        ALTER TABLE substantive_hours.assignment_task
          ADD CONSTRAINT fk_assignment_task_assignment
          FOREIGN KEY (assignment_id)
          REFERENCES substantive_hours.assignment(id)
          ON UPDATE CASCADE ON DELETE CASCADE;
      END IF;

      IF to_regclass('core.person') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignment_person'
         ) THEN
        ALTER TABLE substantive_hours.assignment
          ADD CONSTRAINT fk_assignment_person
          FOREIGN KEY (person_id)
          REFERENCES core.person(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;
      ELSIF to_regclass('public.person') IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM pg_constraint WHERE conname = 'fk_assignment_person'
         ) THEN
        ALTER TABLE substantive_hours.assignment
          ADD CONSTRAINT fk_assignment_person
          FOREIGN KEY (person_id)
          REFERENCES public.person(id)
          ON UPDATE CASCADE ON DELETE RESTRICT;
      END IF;
    END
    $do$;
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_assignment_person_id
      ON substantive_hours.assignment (person_id);
    CREATE INDEX IF NOT EXISTS idx_assignment_task_assignment_id
      ON substantive_hours.assignment_task (assignment_id);
  `);

  console.log("Migración substantive_hours (assignment) completada");
  await pool.end();
}

migrateSubstantiveHoursPerson().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
