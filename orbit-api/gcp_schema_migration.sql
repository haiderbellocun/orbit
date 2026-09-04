-- DDL generado desde el estado actual de la base
-- Base de datos: Core
SET client_encoding = 'UTF8';
SET search_path TO academic_workload, core, logs, substantive_hours;

CREATE SCHEMA IF NOT EXISTS academic_workload;
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS logs;
CREATE SCHEMA IF NOT EXISTS substantive_hours;

CREATE SEQUENCE IF NOT EXISTS academic_workload.academic_load_id_seq;
CREATE SEQUENCE IF NOT EXISTS academic_workload.class_group_id_seq;
CREATE SEQUENCE IF NOT EXISTS academic_workload.class_preparation_id_seq;
CREATE SEQUENCE IF NOT EXISTS core.campus_id_seq;
CREATE SEQUENCE IF NOT EXISTS core.region_id_seq;
CREATE SEQUENCE IF NOT EXISTS logs.logs_orbit_docentes_id_seq;
CREATE SEQUENCE IF NOT EXISTS substantive_hours.category_id_seq;
CREATE SEQUENCE IF NOT EXISTS substantive_hours.assignment_id_seq;
CREATE SEQUENCE IF NOT EXISTS substantive_hours.assignment_task_id_seq;

CREATE TABLE IF NOT EXISTS academic_workload.academic_load (
  id integer DEFAULT nextval('academic_workload.academic_load_id_seq'::regclass) NOT NULL,
  person_id integer NOT NULL,
  period_code character varying(50) NOT NULL,
  semester character varying(50) NULL,
  program_id integer NULL,
  program_name character varying(250) NULL,
  subject_code character varying(50) NOT NULL,
  group_code character varying(50) NOT NULL,
  aca_group_id character varying(50) NULL,
  enrolled_quantity integer DEFAULT 0 NOT NULL,
  region_id integer NULL,
  city_id integer NULL,
  campus_id integer NULL,
  substantive_category_id integer NULL,
  substantive_hours_quantity numeric(6,2) DEFAULT 0 NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  class_preparation_id integer NULL
);

CREATE TABLE IF NOT EXISTS academic_workload.class_group (
  id integer DEFAULT nextval('academic_workload.class_group_id_seq'::regclass) NOT NULL,
  subject_code character varying(50) NOT NULL,
  group_code character varying(50) NOT NULL,
  start_date date NULL,
  end_date date NULL,
  start_time time without time zone NULL,
  end_time time without time zone NULL,
  classroom_name character varying(150) NULL,
  capacity integer DEFAULT 0 NOT NULL,
  block character varying(100) NULL,
  schedule_type character varying(100) NULL,
  modality character varying(100) NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_workload.class_preparation (
  id integer DEFAULT nextval('academic_workload.class_preparation_id_seq'::regclass) NOT NULL,
  person_id integer NOT NULL,
  class_preparation_hours numeric(6,2) DEFAULT 0 NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS academic_workload.subject (
  subject_code character varying(50) NOT NULL,
  name character varying(250) NOT NULL,
  credits_quantity integer DEFAULT 0 NOT NULL,
  hours_quantity numeric(6,2) DEFAULT 0 NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.area (
  id bigint NOT NULL,
  code character varying(100) NULL,
  name character varying(150) NULL,
  is_active boolean DEFAULT true NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.campus (
  id integer DEFAULT nextval('campus_id_seq'::regclass) NOT NULL,
  name character varying(150) NOT NULL,
  city_id integer NOT NULL,
  region_id integer NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.city (
  id bigint NOT NULL,
  name character varying(150) NULL,
  is_active boolean DEFAULT true NULL
);

CREATE TABLE IF NOT EXISTS core.contract_type (
  id bigint NOT NULL,
  code character varying(100) NULL,
  name character varying(150) NULL,
  description text NULL,
  is_active boolean DEFAULT true NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL,
  start_date date NULL,
  end_date date NULL,
  work_schedule character varying(50) NULL,
  modality character varying(50) NULL
);

CREATE TABLE IF NOT EXISTS core.hierarchy (
  id bigint NOT NULL,
  name character varying(150) NULL,
  description text NULL,
  level smallint NULL
);

CREATE TABLE IF NOT EXISTS core.person (
  id bigint NOT NULL,
  contract_type_id bigint NULL,
  area_id bigint NULL,
  school_id bigint NULL,
  program_id bigint NULL,
  city_id bigint NULL,
  hierarchy_id bigint NULL,
  hierarchy_temp_id bigint NULL,
  role_id bigint NULL,
  gender character varying(50) NULL,
  born_date date NULL,
  born_city character varying(150) NULL,
  email character varying(180) NULL,
  edu_email character varying(180) NULL,
  type_document character varying(50) NULL,
  document character varying(80) NULL,
  phone character varying(50) NULL,
  address character varying(250) NULL,
  full_name character varying(250) NULL,
  marital_status character varying(80) NULL,
  region_id integer NULL,
  campus_id integer NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.program (
  id bigint NOT NULL,
  school_id bigint NULL,
  code character varying(100) NULL,
  snies_code character varying(100) NULL,
  name character varying(200) NULL,
  level character varying(100) NULL,
  modality character varying(100) NULL,
  credits integer NULL,
  duration_semesters integer NULL,
  is_active boolean DEFAULT true NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.region (
  id integer DEFAULT nextval('region_id_seq'::regclass) NOT NULL,
  name character varying(150) NOT NULL,
  city_id integer NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.role (
  id bigint NOT NULL,
  code character varying(100) NULL,
  name character varying(150) NULL,
  description text NULL,
  category character varying(100) NULL,
  is_active boolean DEFAULT true NULL,
  sort_order integer NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.role_permission (
  id bigint NOT NULL,
  role_id bigint NULL,
  permission_code character varying(150) NULL,
  scope character varying(100) NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.school (
  id bigint NOT NULL,
  area_id bigint NULL,
  code character varying(100) NULL,
  name character varying(150) NULL,
  modality character varying(100) NULL,
  is_active boolean DEFAULT true NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS core.user (
  id bigint NOT NULL,
  person_id bigint NULL,
  username character varying(150) NULL,
  auth_provider character varying(100) NULL,
  auth_provider_id character varying(200) NULL,
  is_active boolean DEFAULT true NULL,
  last_login_at timestamp without time zone NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS logs.logs_orbit_docentes (
  id integer DEFAULT nextval('logs.logs_orbit_docentes_id_seq'::regclass) NOT NULL,
  import_id uuid NOT NULL,
  import_date timestamp without time zone DEFAULT now() NOT NULL,
  source_file character varying(255) NULL,
  total_rows integer NULL,
  success_count integer DEFAULT 0 NULL,
  error_count integer DEFAULT 0 NULL,
  skipped_count integer DEFAULT 0 NULL,
  created_summary jsonb DEFAULT '{}'::jsonb NULL,
  updated_summary jsonb DEFAULT '{}'::jsonb NULL,
  error_details jsonb DEFAULT '[]'::jsonb NULL,
  duration_ms integer NULL,
  created_at timestamp without time zone DEFAULT now() NULL
);

CREATE TABLE IF NOT EXISTS substantive_hours.category (
  id integer DEFAULT nextval('substantive_hours.category_id_seq'::regclass) NOT NULL,
  name character varying(200) NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS substantive_hours.assignment (
  id integer DEFAULT nextval('substantive_hours.assignment_id_seq'::regclass) NOT NULL,
  person_id bigint NOT NULL,
  category_id integer NULL,
  hours_quantity integer NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS substantive_hours.assignment_task (
  id integer DEFAULT nextval('substantive_hours.assignment_task_id_seq'::regclass) NOT NULL,
  assignment_id integer NOT NULL,
  description text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL
);

-- PRIMARY KEY: academic_workload.academic_load.academic_load_pkey
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT academic_load_pkey PRIMARY KEY (id);

-- PRIMARY KEY: academic_workload.class_group.class_group_pkey
ALTER TABLE ONLY academic_workload.class_group
  ADD CONSTRAINT class_group_pkey PRIMARY KEY (id);

-- PRIMARY KEY: academic_workload.class_preparation.class_preparation_pkey
ALTER TABLE ONLY academic_workload.class_preparation
  ADD CONSTRAINT class_preparation_pkey PRIMARY KEY (id);

-- PRIMARY KEY: academic_workload.subject.subject_pkey
ALTER TABLE ONLY academic_workload.subject
  ADD CONSTRAINT subject_pkey PRIMARY KEY (subject_code);

-- PRIMARY KEY: core.area.area_pkey
ALTER TABLE ONLY core.area
  ADD CONSTRAINT area_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.campus.campus_pkey
ALTER TABLE ONLY core.campus
  ADD CONSTRAINT campus_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.city.city_pkey
ALTER TABLE ONLY core.city
  ADD CONSTRAINT city_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.contract_type.contract_type_pkey
ALTER TABLE ONLY core.contract_type
  ADD CONSTRAINT contract_type_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.hierarchy.hierarchy_pkey
ALTER TABLE ONLY core.hierarchy
  ADD CONSTRAINT hierarchy_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.person.person_pkey
ALTER TABLE ONLY core.person
  ADD CONSTRAINT person_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.program.program_pkey
ALTER TABLE ONLY core.program
  ADD CONSTRAINT program_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.region.region_pkey
ALTER TABLE ONLY core.region
  ADD CONSTRAINT region_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.role.role_pkey
ALTER TABLE ONLY core.role
  ADD CONSTRAINT role_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.role_permission.role_permission_pkey
ALTER TABLE ONLY core.role_permission
  ADD CONSTRAINT role_permission_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.school.school_pkey
ALTER TABLE ONLY core.school
  ADD CONSTRAINT school_pkey PRIMARY KEY (id);

-- PRIMARY KEY: core.user.user_pkey
ALTER TABLE ONLY core.user
  ADD CONSTRAINT user_pkey PRIMARY KEY (id);

-- PRIMARY KEY: logs.logs_orbit_docentes.logs_orbit_docentes_pkey
ALTER TABLE ONLY logs.logs_orbit_docentes
  ADD CONSTRAINT logs_orbit_docentes_pkey PRIMARY KEY (id);

-- PRIMARY KEY: substantive_hours.category.category_pkey
ALTER TABLE ONLY substantive_hours.category
  ADD CONSTRAINT category_pkey PRIMARY KEY (id);

-- PRIMARY KEY: substantive_hours.assignment.assignment_pkey
ALTER TABLE ONLY substantive_hours.assignment
  ADD CONSTRAINT assignment_pkey PRIMARY KEY (id);

-- PRIMARY KEY: substantive_hours.assignment_task.assignment_task_pkey
ALTER TABLE ONLY substantive_hours.assignment_task
  ADD CONSTRAINT assignment_task_pkey PRIMARY KEY (id);

-- UNIQUE: academic_workload.class_group.uq_class_group_subject_group
ALTER TABLE ONLY academic_workload.class_group
  ADD CONSTRAINT uq_class_group_subject_group UNIQUE (subject_code, group_code);

-- UNIQUE: core.area.area_code_key
ALTER TABLE ONLY core.area
  ADD CONSTRAINT area_code_key UNIQUE (code);

-- UNIQUE: core.contract_type.contract_type_code_key
ALTER TABLE ONLY core.contract_type
  ADD CONSTRAINT contract_type_code_key UNIQUE (code);

-- UNIQUE: core.person.person_document_key
ALTER TABLE ONLY core.person
  ADD CONSTRAINT person_document_key UNIQUE (document);

-- UNIQUE: core.person.person_edu_email_key
ALTER TABLE ONLY core.person
  ADD CONSTRAINT person_edu_email_key UNIQUE (edu_email);

-- UNIQUE: core.person.person_email_key
ALTER TABLE ONLY core.person
  ADD CONSTRAINT person_email_key UNIQUE (email);

-- UNIQUE: core.program.program_code_key
ALTER TABLE ONLY core.program
  ADD CONSTRAINT program_code_key UNIQUE (code);

-- UNIQUE: core.role.role_code_key
ALTER TABLE ONLY core.role
  ADD CONSTRAINT role_code_key UNIQUE (code);

-- UNIQUE: core.role_permission.uq_role_permission
ALTER TABLE ONLY core.role_permission
  ADD CONSTRAINT uq_role_permission UNIQUE (role_id, permission_code, scope);

-- UNIQUE: core.school.school_code_key
ALTER TABLE ONLY core.school
  ADD CONSTRAINT school_code_key UNIQUE (code);

-- UNIQUE: core.user.uq_user_auth_provider
ALTER TABLE ONLY core.user
  ADD CONSTRAINT uq_user_auth_provider UNIQUE (auth_provider, auth_provider_id);

-- UNIQUE: core.user.user_username_key
ALTER TABLE ONLY core.user
  ADD CONSTRAINT user_username_key UNIQUE (username);

-- UNIQUE: logs.logs_orbit_docentes.logs_orbit_docentes_import_id_key
ALTER TABLE ONLY logs.logs_orbit_docentes
  ADD CONSTRAINT logs_orbit_docentes_import_id_key UNIQUE (import_id);

-- CHECK: academic_workload.academic_load.chk_academic_load_enrolled_quantity
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT chk_academic_load_enrolled_quantity CHECK (enrolled_quantity >= 0);

-- CHECK: academic_workload.academic_load.chk_academic_load_substantive_hours
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT chk_academic_load_substantive_hours CHECK (substantive_hours_quantity >= 0::numeric);

-- CHECK: academic_workload.class_group.chk_class_group_capacity
ALTER TABLE ONLY academic_workload.class_group
  ADD CONSTRAINT chk_class_group_capacity CHECK (capacity >= 0);

-- CHECK: academic_workload.class_preparation.chk_class_preparation_hours
ALTER TABLE ONLY academic_workload.class_preparation
  ADD CONSTRAINT chk_class_preparation_hours CHECK (class_preparation_hours >= 0::numeric);

-- CHECK: academic_workload.subject.chk_subject_credits
ALTER TABLE ONLY academic_workload.subject
  ADD CONSTRAINT chk_subject_credits CHECK (credits_quantity >= 0);

-- CHECK: academic_workload.subject.chk_subject_hours
ALTER TABLE ONLY academic_workload.subject
  ADD CONSTRAINT chk_subject_hours CHECK (hours_quantity >= 0::numeric);

-- CHECK: substantive_hours.assignment.chk_assignment_hours
ALTER TABLE ONLY substantive_hours.assignment
  ADD CONSTRAINT chk_assignment_hours CHECK (hours_quantity >= 1);

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_campus
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_campus FOREIGN KEY (campus_id) REFERENCES core.campus (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_city
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_city FOREIGN KEY (city_id) REFERENCES core.city (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_class_group
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_class_group FOREIGN KEY (subject_code, group_code) REFERENCES academic_workload.class_group(subject_code, group_code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_class_preparation
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_class_preparation FOREIGN KEY (class_preparation_id) REFERENCES academic_workload.class_preparation(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_person
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_person FOREIGN KEY (person_id) REFERENCES core.person (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_program
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_program FOREIGN KEY (program_id) REFERENCES core.program (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_substantive_category
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_substantive_category FOREIGN KEY (substantive_category_id) REFERENCES substantive_hours.category(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_region
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_region FOREIGN KEY (region_id) REFERENCES core.region (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_subject
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_subject FOREIGN KEY (subject_code) REFERENCES academic_workload.subject(subject_code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: academic_workload.class_group.fk_class_group_subject
ALTER TABLE ONLY academic_workload.class_group
  ADD CONSTRAINT fk_class_group_subject FOREIGN KEY (subject_code) REFERENCES academic_workload.subject(subject_code) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: academic_workload.class_preparation.fk_class_preparation_person
ALTER TABLE ONLY academic_workload.class_preparation
  ADD CONSTRAINT fk_class_preparation_person FOREIGN KEY (person_id) REFERENCES core.person (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: core.campus.fk_campus_city
ALTER TABLE ONLY core.campus
  ADD CONSTRAINT fk_campus_city FOREIGN KEY (city_id) REFERENCES core.city (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: core.campus.fk_campus_region
ALTER TABLE ONLY core.campus
  ADD CONSTRAINT fk_campus_region FOREIGN KEY (region_id) REFERENCES core.region (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_area
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_area FOREIGN KEY (area_id) REFERENCES core.area (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_campus
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_campus FOREIGN KEY (campus_id) REFERENCES core.campus (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_city
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_city FOREIGN KEY (city_id) REFERENCES core.city (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_contract_type
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_contract_type FOREIGN KEY (contract_type_id) REFERENCES core.contract_type (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_hierarchy
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_hierarchy FOREIGN KEY (hierarchy_id) REFERENCES core.hierarchy (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_program
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_program FOREIGN KEY (program_id) REFERENCES core.program (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_region
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_region FOREIGN KEY (region_id) REFERENCES core.region (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_role
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_role FOREIGN KEY (role_id) REFERENCES core.role (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.person.fk_person_school
ALTER TABLE ONLY core.person
  ADD CONSTRAINT fk_person_school FOREIGN KEY (school_id) REFERENCES core.school (id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: core.program.fk_program_school
ALTER TABLE ONLY core.program
  ADD CONSTRAINT fk_program_school FOREIGN KEY (school_id) REFERENCES core.school (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: core.region.fk_region_city
ALTER TABLE ONLY core.region
  ADD CONSTRAINT fk_region_city FOREIGN KEY (city_id) REFERENCES core.city (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: core.role_permission.fk_role_permission_role
ALTER TABLE ONLY core.role_permission
  ADD CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES core.role (id) ON UPDATE CASCADE ON DELETE CASCADE;

-- FOREIGN KEY: core.school.fk_school_area
ALTER TABLE ONLY core.school
  ADD CONSTRAINT fk_school_area FOREIGN KEY (area_id) REFERENCES core.area (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: core.user.fk_user_person
ALTER TABLE ONLY core.user
  ADD CONSTRAINT fk_user_person FOREIGN KEY (person_id) REFERENCES core.person (id) ON UPDATE CASCADE ON DELETE CASCADE;

-- FOREIGN KEY: substantive_hours.assignment.fk_assignment_category
ALTER TABLE ONLY substantive_hours.assignment
  ADD CONSTRAINT fk_assignment_category FOREIGN KEY (category_id) REFERENCES substantive_hours.category(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- FOREIGN KEY: substantive_hours.assignment.fk_assignment_person
ALTER TABLE ONLY substantive_hours.assignment
  ADD CONSTRAINT fk_assignment_person FOREIGN KEY (person_id) REFERENCES core.person (id) ON UPDATE CASCADE ON DELETE RESTRICT;

-- FOREIGN KEY: substantive_hours.assignment_task.fk_assignment_task_assignment
ALTER TABLE ONLY substantive_hours.assignment_task
  ADD CONSTRAINT fk_assignment_task_assignment FOREIGN KEY (assignment_id) REFERENCES substantive_hours.assignment(id) ON UPDATE CASCADE ON DELETE CASCADE;


-- ============================================================
-- Histórico de carga académica (ver migrate_academic_load_history.ts)
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

CREATE TABLE IF NOT EXISTS academic_workload.academic_load_snapshot_2026
  PARTITION OF academic_workload.academic_load_snapshot
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

CREATE TABLE IF NOT EXISTS academic_workload.academic_load_snapshot_default
  PARTITION OF academic_workload.academic_load_snapshot DEFAULT;

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

CREATE OR REPLACE FUNCTION academic_workload.f_run_as_of(p_momento timestamptz)
RETURNS bigint LANGUAGE sql STABLE AS $$
  SELECT id
  FROM academic_workload.import_run
  WHERE status = 'ok' AND is_official AND imported_at <= p_momento
  ORDER BY imported_at DESC
  LIMIT 1;
$$;
