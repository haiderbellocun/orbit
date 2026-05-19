import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
} from "./coreSchema";

/**
 * Escuela para perfiles `orbitAccess: "school"` en login.
 * Usa `person.school_id`, o infiere desde `program_id` / `area_id` en Core.
 */
export async function resolveLoginSchoolId(person: {
  school_id: number | null;
  area_id: number | null;
  program_id: number | null;
}): Promise<number | null> {
  if (person.school_id != null) {
    const direct = Number(person.school_id);
    if (Number.isFinite(direct) && direct > 0) return direct;
  }

  const mode = await resolveCoreSchemaMode();
  if (mode == null) return null;

  const schoolT = qualifiedCoreTable(mode, "school");
  const programT = qualifiedCoreTable(mode, "program");

  if (person.program_id != null) {
    const pid = Number(person.program_id);
    if (Number.isFinite(pid) && pid > 0) {
      const prog = await pool.query(
        `SELECT school_id
         FROM ${programT}
         WHERE id = $1 AND COALESCE(is_active, true) = true`,
        [pid]
      );
      const sid = prog.rows[0]?.school_id;
      if (sid != null && Number.isFinite(Number(sid))) {
        return Number(sid);
      }
    }
  }

  if (person.area_id != null) {
    const aid = Number(person.area_id);
    if (Number.isFinite(aid) && aid > 0) {
      const schools = await pool.query(
        `SELECT id
         FROM ${schoolT}
         WHERE area_id = $1 AND COALESCE(is_active, true) = true
         ORDER BY id ASC`,
        [aid]
      );
      if (schools.rows.length === 1) {
        return Number(schools.rows[0].id);
      }
      if (schools.rows.length > 1) {
        return Number(schools.rows[0].id);
      }
    }
  }

  return null;
}
