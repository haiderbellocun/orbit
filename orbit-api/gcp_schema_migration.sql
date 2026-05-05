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
CREATE SEQUENCE IF NOT EXISTS substantive_hours.project_id_seq;
CREATE SEQUENCE IF NOT EXISTS substantive_hours.substantive_function_id_seq;

CREATE TABLE IF NOT EXISTS academic_workload.academic_load (
  id integer DEFAULT nextval('academic_workload.academic_load_id_seq'::regclass) NOT NULL,
  person_id integer NOT NULL,
  period_code character varying(50) NOT NULL,
  semester character varying(50) NULL,
  program_id integer NULL,
  program_name character varying(250) NULL,
  subject_code character varying(50) NOT NULL,
  group_code character varying(50) NOT NULL,
  enrolled_quantity integer DEFAULT 0 NOT NULL,
  region_id integer NULL,
  city_id integer NULL,
  campus_id integer NULL,
  project_id integer NULL,
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

CREATE TABLE IF NOT EXISTS substantive_hours.project (
  id integer DEFAULT nextval('substantive_hours.project_id_seq'::regclass) NOT NULL,
  name character varying(200) NOT NULL,
  is_active boolean DEFAULT true NOT NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS substantive_hours.substantive_function (
  id integer DEFAULT nextval('substantive_hours.substantive_function_id_seq'::regclass) NOT NULL,
  project_id integer NOT NULL,
  hours_quantity numeric(6,2) DEFAULT 0 NOT NULL,
  observations text NULL,
  created_at timestamp without time zone DEFAULT now() NOT NULL,
  updated_at timestamp without time zone DEFAULT now() NOT NULL
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

-- PRIMARY KEY: substantive_hours.project.project_pkey
ALTER TABLE ONLY substantive_hours.project
  ADD CONSTRAINT project_pkey PRIMARY KEY (id);

-- PRIMARY KEY: substantive_hours.substantive_function.substantive_function_pkey
ALTER TABLE ONLY substantive_hours.substantive_function
  ADD CONSTRAINT substantive_function_pkey PRIMARY KEY (id);

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

-- CHECK: substantive_hours.substantive_function.chk_substantive_function_hours
ALTER TABLE ONLY substantive_hours.substantive_function
  ADD CONSTRAINT chk_substantive_function_hours CHECK (hours_quantity >= 0::numeric);

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

-- FOREIGN KEY: academic_workload.academic_load.fk_academic_load_project
ALTER TABLE ONLY academic_workload.academic_load
  ADD CONSTRAINT fk_academic_load_project FOREIGN KEY (project_id) REFERENCES substantive_hours.project(id) ON UPDATE CASCADE ON DELETE SET NULL;

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

-- FOREIGN KEY: substantive_hours.substantive_function.fk_substantive_function_project
ALTER TABLE ONLY substantive_hours.substantive_function
  ADD CONSTRAINT fk_substantive_function_project FOREIGN KEY (project_id) REFERENCES substantive_hours.project(id) ON UPDATE CASCADE ON DELETE RESTRICT;

