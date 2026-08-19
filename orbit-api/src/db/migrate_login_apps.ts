import { pool } from "./connection";

/**
 * Creates logs.login_apps for cross-app Google login audit.
 * fecha = DATE (display DD-MM-YYYY), hora = TIME (display HH24:MI).
 */
export async function migrateLoginApps(): Promise<void> {
  const sql = `
    CREATE SCHEMA IF NOT EXISTS logs;

    CREATE TABLE IF NOT EXISTS logs.login_apps (
      id BIGSERIAL PRIMARY KEY,
      correo VARCHAR(320) NOT NULL,
      fecha DATE NOT NULL,
      hora TIME NOT NULL,
      app_login VARCHAR(64) NOT NULL,
      CONSTRAINT login_apps_app_login_check
        CHECK (app_login IN ('actas', 'orbit', 'nova', 'acervo'))
    );

    CREATE INDEX IF NOT EXISTS idx_login_apps_correo
      ON logs.login_apps (correo);

    CREATE INDEX IF NOT EXISTS idx_login_apps_fecha
      ON logs.login_apps (fecha DESC);

    CREATE INDEX IF NOT EXISTS idx_login_apps_app_login
      ON logs.login_apps (app_login);

    CREATE INDEX IF NOT EXISTS idx_login_apps_correo_fecha
      ON logs.login_apps (correo, fecha DESC);
  `;

  console.log("Executing logs.login_apps migration...");
  await pool.query(sql);
  console.log("✓ logs.login_apps migration completed");
}

migrateLoginApps()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error("✗ logs.login_apps migration failed:", error);
    await pool.end();
    process.exit(1);
  });
