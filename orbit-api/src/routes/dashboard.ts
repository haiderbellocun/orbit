import { Router, type Request } from "express";
import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import { hasCapability, ORBIT_CAPABILITY } from "../lib/orbitCapabilities";
import {
  newsScopeFromRequest,
  newsScopeSql,
  type NewsScope,
} from "../lib/newsScope";
import { sqlPersonIsActive } from "../sql/personActive";
import {
  liteTeacherScopeFromRequest,
  schoolScopeFromRequest,
} from "../middleware/orbitAuth";

const router = Router();

async function hasLegacyTeachersTable(): Promise<boolean> {
  const result = await pool.query(
    "SELECT to_regclass('teachers') AS table_name"
  );
  return result.rows[0]?.table_name != null;
}

type TrendType = "up" | "down" | "flat";

/** `trendUnit` define el formato en UI; `trendGood` si la dirección es favorable. */
type SummaryMetric = {
  value: number;
  trend: number;
  trendType: TrendType;
  trendUnit: "percent" | "absolute" | "none";
  trendGood: boolean;
  detail: string;
};

type DashboardSummaryResponse = {
  activeTeachers: SummaryMetric & {
    capacityPercentage: number | null;
  };
  openVacancies: SummaryMetric & {
    averageDaysToClose: number | null;
    positionsOpen: number;
  };
  monthlyHires: SummaryMetric & {
    positionsFilled: number;
  };
  timeToHire: SummaryMetric & {
    sampleSize: number;
  };
  agingVacancies: SummaryMetric & {
    oldestDays: number | null;
  };
  todayNews: SummaryMetric & {
    criticalCount: number;
  };
  updatedAt: string;
};

const FLAT_TREND = { trend: 0, trendType: "flat" as TrendType };

/** Variación absoluta entre dos periodos; `higherIsBetter` decide el color en UI. */
function absoluteTrend(
  current: number,
  previous: number,
  higherIsBetter: boolean
): Pick<SummaryMetric, "trend" | "trendType" | "trendUnit" | "trendGood"> {
  const delta = current - previous;
  const trendType: TrendType = delta === 0 ? "flat" : delta > 0 ? "up" : "down";
  return {
    trend: delta,
    trendType,
    trendUnit: "absolute",
    trendGood: delta === 0 || (delta > 0) === higherIsBetter,
  };
}

function percentTrend(
  current: number,
  previous: number,
  higherIsBetter: boolean
): Pick<SummaryMetric, "trend" | "trendType" | "trendUnit" | "trendGood"> {
  if (previous <= 0) {
    return {
      ...FLAT_TREND,
      trendUnit: "percent",
      trendGood: true,
    };
  }
  const pct = ((current - previous) / previous) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const trendType: TrendType =
    rounded === 0 ? "flat" : rounded > 0 ? "up" : "down";
  return {
    trend: rounded,
    trendType,
    trendUnit: "percent",
    trendGood: rounded === 0 || rounded > 0 === higherIsBetter,
  };
}

const NO_TREND: Pick<
  SummaryMetric,
  "trend" | "trendType" | "trendUnit" | "trendGood"
> = { ...FLAT_TREND, trendUnit: "none", trendGood: true };

async function getActiveTeachersCount(req: Request): Promise<number> {
  const useLegacy = await hasLegacyTeachersTable();
  const lite = liteTeacherScopeFromRequest(req);
  const schoolScope = schoolScopeFromRequest(req);

  if (useLegacy && lite != null) {
    return 0;
  }

  if (useLegacy) {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS total FROM teachers WHERE status = 'active'"
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  if (lite != null) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM person p
       LEFT JOIN role r ON r.id = p.role_id
       LEFT JOIN person_program_assignments ppa ON ppa.person_id = p.id
       WHERE ${sqlPersonIsActive("p")}
         AND r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')
         AND p.school_id = $1
         AND (
           p.program_id = ANY($2::integer[])
           OR COALESCE(ppa.programs_id, ARRAY[]::integer[]) && $2::integer[]
         )`,
      [lite.schoolId, lite.programIds]
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  if (schoolScope != null) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM person p
       LEFT JOIN role r ON r.id = p.role_id
       WHERE ${sqlPersonIsActive("p")}
         AND r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')
         AND p.school_id = $1`,
      [schoolScope.schoolId]
    );
    return Number(result.rows[0]?.total ?? 0);
  }

  const result = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM person p
     LEFT JOIN role r ON r.id = p.role_id
     WHERE ${sqlPersonIsActive("p")}
       AND r.name IN ('DOCENTES', 'DOCENTES PENSIONADOS')`
  );
  return Number(result.rows[0]?.total ?? 0);
}

function newsScopeClause(
  scope: NewsScope,
  aliasAp: string,
  aliasS: string,
  startIdx: number
): { clause: string; values: unknown[] } {
  const part = newsScopeSql(scope, aliasAp, aliasS, startIdx);
  return { clause: part.clause, values: part.values };
}

async function getTodayNewsMetrics(req: Request): Promise<{
  value: number;
  criticalCount: number;
  detail: string;
}> {
  const u = req.orbitUser;
  if (!u || !hasCapability(u.capabilities, ORBIT_CAPABILITY.NEWS)) {
    return {
      value: 0,
      criticalCount: 0,
      detail: "Sin acceso al módulo de novedades",
    };
  }

  const scope = newsScopeFromRequest(req);
  if (scope == null) {
    return { value: 0, criticalCount: 0, detail: "Sin alcance de novedades" };
  }

  const reg = await pool.query(
    `SELECT to_regclass('workforce_events.event') AS table_name`
  );
  if (reg.rows[0]?.table_name == null) {
    return { value: 0, criticalCount: 0, detail: "Módulo de novedades no disponible" };
  }

  const mode = await resolveCoreSchemaMode();
  if (mode == null) {
    return { value: 0, criticalCount: 0, detail: "CORE no disponible" };
  }

  const personT = qualifiedCoreTable(mode, "person");
  const schoolT = qualifiedCoreTable(mode, "school");
  const scopePart = newsScopeClause(scope, "ap", "sch", 1);

  const todayResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM workforce_events.event e
     JOIN ${personT} ap ON ap.id = e.person_id
     LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
     WHERE e.created_at >= date_trunc('day', now())
       AND (${scopePart.clause})`,
    scopePart.values
  );

  const criticalResult = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM workforce_events.event e
     JOIN ${personT} ap ON ap.id = e.person_id
     LEFT JOIN ${schoolT} sch ON sch.id = ap.school_id
     WHERE e.status IN ('NOT_TAKEN', 'PENDING')
       AND e.created_at >= now() - interval '30 days'
       AND (${scopePart.clause})`,
    scopePart.values
  );

  const value = Number(todayResult.rows[0]?.total ?? 0);
  const criticalCount = Number(criticalResult.rows[0]?.total ?? 0);
  return {
    value,
    criticalCount,
    detail:
      criticalCount > 0
        ? `${criticalCount} pendiente(s) o sin tomar (30 días)`
        : value > 0
          ? `${value} registrada(s) hoy`
          : "Sin novedades hoy",
  };
}

/** Etapas en las que la vacante sigue viva (no contratada ni cancelada). */
const IN_PROCESS_STATUSES = ["open", "selected", "requisition_sent"];

type VacancyMetrics = {
  openVacancies: DashboardSummaryResponse["openVacancies"];
  monthlyHires: DashboardSummaryResponse["monthlyHires"];
  timeToHire: DashboardSummaryResponse["timeToHire"];
  agingVacancies: DashboardSummaryResponse["agingVacancies"];
};

function emptyVacancyMetrics(detail: string): VacancyMetrics {
  return {
    openVacancies: { value: 0, ...NO_TREND, detail, averageDaysToClose: null, positionsOpen: 0 },
    monthlyHires: { value: 0, ...NO_TREND, detail, positionsFilled: 0 },
    timeToHire: { value: 0, ...NO_TREND, detail, sampleSize: 0 },
    agingVacancies: { value: 0, ...NO_TREND, detail, oldestDays: null },
  };
}

async function getVacancyMetrics(req: Request): Promise<VacancyMetrics> {
  const u = req.orbitUser;
  if (!u || !hasCapability(u.capabilities, ORBIT_CAPABILITY.VACANCIES)) {
    return emptyVacancyMetrics("Sin acceso al módulo de vacantes");
  }

  const reg = await pool.query(
    `SELECT to_regclass('vacancies.vacancy') AS table_name`
  );
  if (reg.rows[0]?.table_name == null) {
    return emptyVacancyMetrics("Módulo de vacantes no disponible");
  }

  const schoolScope = schoolScopeFromRequest(req);
  const scopeClause = schoolScope ? `WHERE v.school_id = $1` : "";
  const scopeValues = schoolScope ? [schoolScope.schoolId] : [];

  const inProcess = IN_PROCESS_STATUSES.map((s) => `'${s}'`).join(", ");

  const { rows } = await pool.query(
    `WITH scoped AS (SELECT v.* FROM vacancies.vacancy v ${scopeClause})
     SELECT
       COUNT(*) FILTER (WHERE operation_status IN (${inProcess}))::int AS in_process,
       COUNT(*) FILTER (WHERE operation_status = 'open')::int AS stage_open,
       COUNT(*) FILTER (WHERE operation_status = 'selected')::int AS stage_selected,
       COUNT(*) FILTER (WHERE operation_status = 'requisition_sent')::int AS stage_requisition,
       COALESCE(SUM(quantity) FILTER (WHERE operation_status IN (${inProcess})), 0)::int AS positions_open,
       COUNT(*) FILTER (
         WHERE operation_status IN (${inProcess})
           AND created_at < now() - interval '30 days'
       )::int AS aging_count,
       MAX(EXTRACT(EPOCH FROM (now() - created_at)) / 86400)
         FILTER (WHERE operation_status IN (${inProcess})) AS oldest_open_days,
       COUNT(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS created_30d,
       COUNT(*) FILTER (WHERE closed_at >= now() - interval '30 days')::int AS closed_30d,
       COUNT(*) FILTER (
         WHERE operation_status = 'hired'
           AND closed_at >= date_trunc('month', now())
       )::int AS hires_current_month,
       COUNT(*) FILTER (
         WHERE operation_status = 'hired'
           AND closed_at >= date_trunc('month', now()) - interval '1 month'
           AND closed_at < date_trunc('month', now())
       )::int AS hires_previous_month,
       COALESCE(SUM(hired_quantity) FILTER (
         WHERE operation_status = 'hired'
           AND closed_at >= date_trunc('month', now())
       ), 0)::int AS positions_filled_month,
       AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400) FILTER (
         WHERE operation_status = 'hired'
           AND closed_at >= now() - interval '90 days'
       ) AS avg_days_current,
       COUNT(*) FILTER (
         WHERE operation_status = 'hired'
           AND closed_at >= now() - interval '90 days'
       )::int AS sample_current,
       AVG(EXTRACT(EPOCH FROM (closed_at - created_at)) / 86400) FILTER (
         WHERE operation_status = 'hired'
           AND closed_at >= now() - interval '180 days'
           AND closed_at < now() - interval '90 days'
       ) AS avg_days_previous
     FROM scoped`,
    scopeValues
  );

  const r = (rows[0] ?? {}) as Record<string, unknown>;
  const num = (key: string): number => Number(r[key] ?? 0) || 0;
  const nullableNum = (key: string): number | null => {
    const raw = r[key];
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  };

  const inProcessCount = num("in_process");
  const stageOpen = num("stage_open");
  const stageSelected = num("stage_selected");
  const stageRequisition = num("stage_requisition");
  const positionsOpen = num("positions_open");
  const agingCount = num("aging_count");
  const oldestOpenDays = nullableNum("oldest_open_days");
  const created30d = num("created_30d");
  const closed30d = num("closed_30d");
  const hiresCurrentMonth = num("hires_current_month");
  const hiresPreviousMonth = num("hires_previous_month");
  const positionsFilledMonth = num("positions_filled_month");
  const avgDaysCurrent = nullableNum("avg_days_current");
  const avgDaysPrevious = nullableNum("avg_days_previous");
  const sampleCurrent = num("sample_current");

  const roundedAvgCurrent =
    avgDaysCurrent != null ? Math.round(avgDaysCurrent) : null;
  const roundedAvgPrevious =
    avgDaysPrevious != null ? Math.round(avgDaysPrevious) : null;

  const stageParts: string[] = [];
  if (stageOpen > 0) stageParts.push(`${stageOpen} abierta(s)`);
  if (stageSelected > 0) stageParts.push(`${stageSelected} en selección`);
  if (stageRequisition > 0) {
    stageParts.push(`${stageRequisition} en requisición`);
  }

  return {
    openVacancies: {
      value: inProcessCount,
      // Flujo neto del mes: entradas menos cierres. Menos vacantes abiertas es mejor.
      ...absoluteTrend(created30d, closed30d, false),
      detail:
        stageParts.length > 0
          ? stageParts.join(" · ")
          : "Sin vacantes en proceso",
      averageDaysToClose: roundedAvgCurrent,
      positionsOpen,
    },
    monthlyHires: {
      value: hiresCurrentMonth,
      ...absoluteTrend(hiresCurrentMonth, hiresPreviousMonth, true),
      detail:
        positionsFilledMonth > 0
          ? `${positionsFilledMonth} plaza(s) cubierta(s) este mes`
          : "Sin contrataciones este mes",
      positionsFilled: positionsFilledMonth,
    },
    timeToHire: {
      value: roundedAvgCurrent ?? 0,
      ...(roundedAvgCurrent != null && roundedAvgPrevious != null
        ? percentTrend(roundedAvgCurrent, roundedAvgPrevious, false)
        : NO_TREND),
      detail:
        sampleCurrent > 0
          ? `Promedio sobre ${sampleCurrent} cierre(s) en 90 días`
          : "Sin cierres en los últimos 90 días",
      sampleSize: sampleCurrent,
    },
    agingVacancies: {
      value: agingCount,
      ...NO_TREND,
      trendGood: agingCount === 0,
      detail:
        oldestOpenDays != null && agingCount > 0
          ? `La más antigua lleva ${Math.round(oldestOpenDays)} días`
          : "Ninguna supera los 30 días",
      oldestDays: oldestOpenDays != null ? Math.round(oldestOpenDays) : null,
    },
  };
}

router.get("/dashboard/summary", async (req, res) => {
  try {
    const activeTeachers = await getActiveTeachersCount(req);
    const todayNewsMetrics = await getTodayNewsMetrics(req);
    const vacancyMetrics = await getVacancyMetrics(req);

    const payload: DashboardSummaryResponse = {
      activeTeachers: {
        value: activeTeachers,
        ...NO_TREND,
        detail: "Docentes activos en planta",
        capacityPercentage: null,
      },
      openVacancies: vacancyMetrics.openVacancies,
      monthlyHires: vacancyMetrics.monthlyHires,
      timeToHire: vacancyMetrics.timeToHire,
      agingVacancies: vacancyMetrics.agingVacancies,
      todayNews: {
        value: todayNewsMetrics.value,
        ...NO_TREND,
        trendGood: todayNewsMetrics.criticalCount === 0,
        detail: todayNewsMetrics.detail,
        criticalCount: todayNewsMetrics.criticalCount,
      },
      updatedAt: new Date().toISOString(),
    };

    res.json(payload);
  } catch (error) {
    console.error("GET /dashboard/summary failed:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
