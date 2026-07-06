import { pool } from "./connection";

/**
 * Audit logging migration
 * Creates logs schema and logs_orbit_docentes table for import auditing
 */
export async function migrateAudit(): Promise<void> {
  const schemaSql = `
    -- Create logs schema if not exists
    CREATE SCHEMA IF NOT EXISTS logs;

    -- Create logs_orbit_docentes table for import tracking
    CREATE TABLE IF NOT EXISTS logs.logs_orbit_docentes (
      id SERIAL PRIMARY KEY,
      import_id UUID UNIQUE NOT NULL,
      import_date TIMESTAMP NOT NULL DEFAULT NOW(),
      source_file VARCHAR(255),
      total_rows INTEGER,
      success_count INTEGER DEFAULT 0,
      error_count INTEGER DEFAULT 0,
      skipped_count INTEGER DEFAULT 0,
      created_summary JSONB DEFAULT '{}',
      updated_summary JSONB DEFAULT '{}',
      error_details JSONB DEFAULT '[]',
      duration_ms INTEGER,
      created_at TIMESTAMP DEFAULT NOW()
    );

    -- Create indexes for audit table
    CREATE INDEX IF NOT EXISTS idx_logs_import_id ON logs.logs_orbit_docentes(import_id);
    CREATE INDEX IF NOT EXISTS idx_logs_import_date ON logs.logs_orbit_docentes(import_date DESC);
  `;

  try {
    console.log("Executing audit schema migration...");
    await pool.query(schemaSql);
    console.log("✓ Audit schema migration completed successfully");
  } catch (error) {
    console.error("✗ Audit schema migration failed:", error);
    throw error;
  }
}

// Execute migration
migrateAudit()
  .then(() => {
    console.log("Migration successful");
    process.exit(0);
  })
  .catch(() => {
    console.log("Migration failed");
    process.exit(1);
  });

