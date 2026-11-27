/**
 * Alertas por docente, compartidas por Carga Académica, Balance carga y el
 * Excel. Misma regla de balance que Balance carga:
 *   diferencia = horas contrato − cátedra − preparación − sustantivas
 * Cátedra (carga académica): presencial = créditos de la asignatura; virtual =
 * estudiantes ÷ 50 × 2. Del periodo indicado o de todos los periodos vigentes.
 * Tope de estudiantes virtuales: 520 (tiempo completo) / 250 (medio tiempo).
 */

import { pool } from "../db/connection";
import { sqlPeriodIsCurrent } from "../sql/currentPeriods";
import { loadResponsibleIndex } from "./orgResponsible";
import {
  DEFAULT_CLASS_PREPARATION_HOURS,
  maxVirtualStudents,
  sqlAssignmentLoadHours,
  sqlAssignmentLoadJoins,
  sqlAssignmentStudents,
  sqlGroupIsVirtual,
  weeklyContractHoursFromLabels,
} from "./substantiveHours";

export const TEACHER_ALERT_KEYS = [
  "overload",
  "no_schedule",
  "no_responsible",
  "no_edu_email",
  "virtual_students_over",
] as const;

export type TeacherAlertKey = (typeof TEACHER_ALERT_KEYS)[number];

export function parseTeacherAlertKey(raw: unknown): TeacherAlertKey | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  return (TEACHER_ALERT_KEYS as readonly string[]).includes(v) ? (v as TeacherAlertKey) : null;
}

export type TeacherAlertInfo = {
  contract_hours: number | null;
  catedra_hours: number;
  preparation_hours: number;
  preparation_registered: boolean;
  substantive_hours: number;
  /** Estudiantes en grupos virtuales (vigentes). */
  virtual_students: number;
  /** Tope de estudiantes virtuales según jornada (520/250); null sin jornada. */
  virtual_students_max: number | null;
  /** Puede ser negativa (sobrecarga). null si no hay jornada. */
  difference: number | null;
  alerts: TeacherAlertKey[];
};

export type AlertsSummary = Record<TeacherAlertKey, number>;

export function emptyAlertsSummary(): AlertsSummary {
  return { overload: 0, no_schedule: 0, no_responsible: 0, no_edu_email: 0, virtual_students_over: 0 };
}

export function summarizeAlerts(infos: Iterable<TeacherAlertInfo>): AlertsSummary {
  const summary = emptyAlertsSummary();
  for (const info of infos) for (const key of info.alerts) summary[key] += 1;
  return summary;
}

export async function computeTeacherAlerts(
  personIds: readonly number[],
  period?: string | null
): Promise<Map<number, TeacherAlertInfo>> {
  const result = new Map<number, TeacherAlertInfo>();
  const ids = [...new Set(personIds.filter((id) => Number.isFinite(id)))];
  if (ids.length === 0) return result;

  const [peopleR, prepR, catedraR, substantiveR, responsibleIndex] = await Promise.all([
    pool.query(
      `SELECT p.id, NULLIF(TRIM(p.edu_email), '') AS edu_email, ct.name AS contract_type, ct.work_schedule
       FROM person p LEFT JOIN contract_type ct ON ct.id = p.contract_type_id
       WHERE p.id = ANY($1::bigint[])`,
      [ids]
    ),
    pool.query(
      `SELECT DISTINCT ON (person_id) person_id, class_preparation_hours
       FROM academic_workload.class_preparation
       WHERE person_id = ANY($1::bigint[])
       ORDER BY person_id, updated_at DESC NULLS LAST, id DESC`,
      [ids]
    ),
    pool.query(
      `SELECT al.person_id,
         COALESCE(SUM(${sqlAssignmentLoadHours()}), 0) AS hours,
         COALESCE(SUM(CASE WHEN ${sqlGroupIsVirtual()} THEN ${sqlAssignmentStudents()} ELSE 0 END), 0) AS virtual_students
       FROM academic_workload.academic_load al
       ${sqlAssignmentLoadJoins()}
       WHERE al.person_id = ANY($1::bigint[]) AND ${sqlPeriodIsCurrent("al")}${period ? " AND al.period_code = $2" : ""}
       GROUP BY al.person_id`,
      period ? [ids, period] : [ids]
    ),
    pool.query(
      `SELECT person_id, COALESCE(SUM(hours_quantity), 0) AS hours
       FROM substantive_hours.assignment
       WHERE person_id = ANY($1::bigint[])
       GROUP BY person_id`,
      [ids]
    ),
    loadResponsibleIndex().catch(() => null),
  ]);

  const prep = new Map(prepR.rows.map((r) => [Number(r.person_id), Number(r.class_preparation_hours)]));
  const catedra = new Map(catedraR.rows.map((r) => [Number(r.person_id), Number(r.hours) || 0]));
  const virtualStudents = new Map(
    catedraR.rows.map((r) => [Number(r.person_id), Number(r.virtual_students) || 0])
  );
  const substantive = new Map(substantiveR.rows.map((r) => [Number(r.person_id), Number(r.hours) || 0]));

  for (const row of peopleR.rows) {
    const id = Number(row.id);
    const contractHours = weeklyContractHoursFromLabels(row.work_schedule, row.contract_type);
    const preparationRegistered = prep.has(id);
    const preparationHours = preparationRegistered ? prep.get(id)! : DEFAULT_CLASS_PREPARATION_HOURS;
    const catedraHours = catedra.get(id) ?? 0;
    const substantiveHours = substantive.get(id) ?? 0;
    const virtual = virtualStudents.get(id) ?? 0;
    const virtualMax = maxVirtualStudents(contractHours);
    const difference =
      contractHours != null ? contractHours - catedraHours - preparationHours - substantiveHours : null;

    const alerts: TeacherAlertKey[] = [];
    if (difference != null && difference < 0) alerts.push("overload");
    if (contractHours == null) alerts.push("no_schedule");
    if (responsibleIndex && !responsibleIndex.reachable.has(id)) alerts.push("no_responsible");
    if (!row.edu_email) alerts.push("no_edu_email");
    if (virtualMax != null && virtual > virtualMax) alerts.push("virtual_students_over");
    // Sin preparación registrada no es alerta: se infieren 2 h automáticamente.

    result.set(id, {
      contract_hours: contractHours,
      catedra_hours: catedraHours,
      preparation_hours: preparationHours,
      preparation_registered: preparationRegistered,
      substantive_hours: substantiveHours,
      virtual_students: virtual,
      virtual_students_max: virtualMax,
      difference,
      alerts,
    });
  }
  return result;
}
