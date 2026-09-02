import type { Pool, PoolClient } from "pg";
import { sqlRoleIsLiteOrLider } from "./orbitRoles";

/** Default de preparación de clase cuando no hay fila en class_preparation. */
export const DEFAULT_CLASS_PREPARATION_HOURS = 4;

type Queryable = Pool | PoolClient;

export async function purgeTeacherHoursForPerson(
  db: Queryable,
  personId: number
): Promise<{ preparationDeleted: number; assignmentsDeleted: number }> {
  const prep = await db.query(
    `DELETE FROM academic_workload.class_preparation WHERE person_id = $1`,
    [personId]
  );
  const assignments = await db.query(
    `DELETE FROM substantive_hours.assignment WHERE person_id = $1`,
    [personId]
  );
  return {
    preparationDeleted: prep.rowCount ?? 0,
    assignmentsDeleted: assignments.rowCount ?? 0,
  };
}

/** Borra preparación de clase y horas sustantivas de personas con rol LITE/LIDER. */
export async function purgeTeacherHoursForLitePersons(
  db: Queryable,
  personPrefix: string
): Promise<{
  preparationDeleted: number;
  assignmentsDeleted: number;
  liteCount: number;
}> {
  const lite = await db.query(
    `SELECT p.id
     FROM ${personPrefix}person p
     LEFT JOIN ${personPrefix}role r ON r.id = p.role_id
     WHERE ${sqlRoleIsLiteOrLider("r")}`
  );
  const ids = lite.rows
    .map((row) => Number(row.id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (ids.length === 0) {
    return { preparationDeleted: 0, assignmentsDeleted: 0, liteCount: 0 };
  }
  const prep = await db.query(
    `DELETE FROM academic_workload.class_preparation
     WHERE person_id = ANY($1::int[])`,
    [ids]
  );
  const assignments = await db.query(
    `DELETE FROM substantive_hours.assignment
     WHERE person_id = ANY($1::bigint[])`,
    [ids]
  );
  return {
    preparationDeleted: prep.rowCount ?? 0,
    assignmentsDeleted: assignments.rowCount ?? 0,
    liteCount: ids.length,
  };
}

/** Placeholder hasta que definan el catálogo real de categorías. */
export const PLACEHOLDER_SUBSTANTIVE_CATEGORY =
  "PEDIR LISTA CATEGORIAS HORAS SUSTANTIVAS";

/**
 * Horas semanales de contrato por dedicación.
 * Tiempo completo = 42; medio tiempo = 21.
 */
export function weeklyContractHoursFromLabels(
  workSchedule: string | null | undefined,
  contractName: string | null | undefined
): number | null {
  const blob = `${workSchedule ?? ""} ${contractName ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!blob.trim()) return null;
  if (
    /\bmedio\b/.test(blob) ||
    /\bmedia\b/.test(blob) ||
    /medio\s*tiempo/.test(blob) ||
    /\b1\/2\b/.test(blob) ||
    /\b21\b/.test(blob)
  ) {
    return 21;
  }
  if (
    /tiempo\s*completo/.test(blob) ||
    /\bcompleto\b/.test(blob) ||
    /\bfull\b/.test(blob) ||
    /\b42\b/.test(blob)
  ) {
    return 42;
  }
  return null;
}

export function parsePositiveIntHours(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }
  return null;
}
