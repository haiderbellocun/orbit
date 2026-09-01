import { pool } from "./connection";

/**
 * Core schema migration
 * Creates all tables: area, city, contract_type, hierarchy, person, program, role, role_permission, school, user
 */
export async function migrateCore(): Promise<void> {
  const schemaSql = `
    -- Create area table
    CREATE TABLE IF NOT EXISTS area (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(150) NOT NULL,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create school table (depends on area)
    CREATE TABLE IF NOT EXISTS school (
      id SERIAL PRIMARY KEY,
      area_id INTEGER REFERENCES area(id),
      code VARCHAR(50) UNIQUE,
      name VARCHAR(150) NOT NULL,
      modality VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create city table
    CREATE TABLE IF NOT EXISTS city (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      is_active BOOLEAN DEFAULT true
    );

    -- Create contract_type table
    CREATE TABLE IF NOT EXISTS contract_type (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(150) NOT NULL,
      description TEXT,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      start_date DATE,
      end_date DATE,
      work_schedule VARCHAR(150),
      modality VARCHAR(100)
    );

    -- Create hierarchy table
    CREATE TABLE IF NOT EXISTS hierarchy (
      id SERIAL PRIMARY KEY,
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      level INTEGER
    );

    -- Create program table (depends on school)
    CREATE TABLE IF NOT EXISTS program (
      id SERIAL PRIMARY KEY,
      school_id INTEGER REFERENCES school(id),
      code VARCHAR(50) UNIQUE,
      snies_code VARCHAR(50),
      name VARCHAR(150) NOT NULL,
      level VARCHAR(100),
      modality VARCHAR(100),
      credits INTEGER,
      duration_semesters INTEGER,
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create role table
    CREATE TABLE IF NOT EXISTS role (
      id SERIAL PRIMARY KEY,
      code VARCHAR(50) UNIQUE,
      name VARCHAR(150) NOT NULL UNIQUE,
      description TEXT,
      category VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      sort_order INTEGER,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create role_permission table (depends on role)
    CREATE TABLE IF NOT EXISTS role_permission (
      id SERIAL PRIMARY KEY,
      role_id INTEGER NOT NULL REFERENCES role(id),
      permission_code VARCHAR(150) NOT NULL,
      scope VARCHAR(100),
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Create person table (depends on all lookup tables)
    CREATE TABLE IF NOT EXISTS person (
      id SERIAL PRIMARY KEY,
      contract_type_id INTEGER REFERENCES contract_type(id),
      area_id INTEGER REFERENCES area(id),
      school_id INTEGER REFERENCES school(id),
      program_id INTEGER REFERENCES program(id),
      city_id INTEGER REFERENCES city(id),
      hierarchy_id INTEGER REFERENCES hierarchy(id),
      hierarchy_temp_id INTEGER,
      role_id INTEGER REFERENCES role(id),
      manager_id INTEGER REFERENCES person(id) ON DELETE SET NULL,
      gender VARCHAR(20),
      born_date DATE,
      born_city VARCHAR(150),
      email VARCHAR(150),
      edu_email VARCHAR(150),
      type_document VARCHAR(50),
      document VARCHAR(50) UNIQUE NOT NULL,
      phone VARCHAR(20),
      address VARCHAR(255),
      full_name VARCHAR(300) NOT NULL,
      marital_status VARCHAR(50),
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create user table (depends on person)
    CREATE TABLE IF NOT EXISTS "user" (
      id SERIAL PRIMARY KEY,
      person_id INTEGER NOT NULL REFERENCES person(id),
      username VARCHAR(150) UNIQUE,
      auth_provider VARCHAR(50),
      auth_provider_id VARCHAR(255),
      is_active BOOLEAN DEFAULT true,
      last_login_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    -- Create person_program_assignments table (depends on person)
    -- 1 row per person; programs_id holds INTEGER[] of program.id values.
    -- Allows a single person to be linked to multiple programs while keeping
    -- person.program_id as the "primary" program for legacy queries.
    CREATE TABLE IF NOT EXISTS person_program_assignments (
      id BIGSERIAL PRIMARY KEY,
      person_id BIGINT NOT NULL UNIQUE REFERENCES person(id) ON DELETE CASCADE,
      programs_id INTEGER[] NOT NULL DEFAULT '{}',
      academic_line VARCHAR(150),
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    -- Create indexes for common lookups
    CREATE INDEX IF NOT EXISTS idx_person_document ON person(document);
    CREATE INDEX IF NOT EXISTS idx_person_email ON person(email);
    CREATE INDEX IF NOT EXISTS idx_school_area_id ON school(area_id);
    CREATE INDEX IF NOT EXISTS idx_program_school_id ON program(school_id);
    CREATE INDEX IF NOT EXISTS idx_role_permission_role_id ON role_permission(role_id);
    CREATE INDEX IF NOT EXISTS idx_user_person_id ON "user"(person_id);
    CREATE INDEX IF NOT EXISTS idx_ppa_programs_id_gin ON person_program_assignments USING GIN (programs_id);
    CREATE INDEX IF NOT EXISTS idx_ppa_academic_line ON person_program_assignments(academic_line);

    -- person.is_active: inactivos no aparecen en listados (LITE / coordinador / docente)
    ALTER TABLE person ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
    UPDATE person SET is_active = true WHERE is_active IS NULL;

    ALTER TABLE person ADD COLUMN IF NOT EXISTS manager_id INTEGER REFERENCES person(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_person_manager_id ON person(manager_id);

    -- Login usa role.code/name: filas con code vacío fallan otras integraciones; rellenar desde name
    UPDATE role
    SET code = upper(regexp_replace(trim(name), '\\s+', '_', 'g'))
    WHERE trim(name) <> ''
      AND (code IS NULL OR trim(code) = '');
  `;

  try {
    console.log("Executing core schema migration...");
    await pool.query(schemaSql);
    console.log("✓ Core schema migration completed successfully");
  } catch (error) {
    console.error("✗ Core schema migration failed:", error);
    throw error;
  }
}

// Execute migration
migrateCore()
  .then(() => {
    console.log("Migration successful");
    process.exit(0);
  })
  .catch(() => {
    console.log("Migration failed");
    process.exit(1);
  });

