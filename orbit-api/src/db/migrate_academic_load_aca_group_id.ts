import { pool } from "./connection";

/**
 * Conserva el ID_GRUPO interno de ACA en cada asignación docente.
 *
 * NUM_GRUPO (group_code) puede repetirse entre materias y periodos, mientras
 * que aca_group_id permite consultar el grupo exacto reportado por ACA.
 */
async function migrateAcademicLoadAcaGroupId(): Promise<void> {
  await pool.query(`
    ALTER TABLE academic_workload.academic_load
      ADD COLUMN IF NOT EXISTS aca_group_id VARCHAR(50);

    CREATE INDEX IF NOT EXISTS idx_academic_load_aca_group_id
      ON academic_workload.academic_load (aca_group_id);
  `);

  console.log("Migración academic_load.aca_group_id completada");
  await pool.end();
}

migrateAcademicLoadAcaGroupId().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
