/**
 * Periodos vigentes de Carga Académica.
 *
 * Un periodo se oculta en Orbit (Carga Académica, Balance carga, alertas y
 * Excel) cuando todos sus grupos terminaron hace más de PERIOD_GRACE_DAYS días.
 * No se borra nada: la importación sigue trayendo esos periodos y siguen en la
 * base; solo dejan de leerse.
 */

export const PERIOD_GRACE_DAYS = 15;

/** Periodos cuyo último grupo terminó hace más de PERIOD_GRACE_DAYS días. */
const SQL_EXPIRED_PERIODS = `(
  SELECT al_xp.period_code
  FROM academic_workload.academic_load al_xp
  JOIN academic_workload.class_group cg_xp
    ON cg_xp.subject_code = al_xp.subject_code
   AND cg_xp.group_code = al_xp.group_code
  WHERE al_xp.period_code IS NOT NULL
  GROUP BY al_xp.period_code
  HAVING MAX(cg_xp.end_date) < CURRENT_DATE - ${PERIOD_GRACE_DAYS}
)`;

/** Condición SQL: la fila de carga `alias` pertenece a un periodo vigente. */
export function sqlPeriodIsCurrent(alias = "al"): string {
  return `${alias}.period_code NOT IN ${SQL_EXPIRED_PERIODS}`;
}
