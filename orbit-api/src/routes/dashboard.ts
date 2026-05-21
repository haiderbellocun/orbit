import { Router, type Request } from "express";
import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import { hasCapability, ORBIT_CAPABILITY } from "../lib/orbitCapabilities";
import {
  newsScopeFromRequest,
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

type SummaryMetric = {
  value: number;
  trend: number;
  trendType: TrendType;
  detail: string;
};

type DashboardSummaryResponse = {
  activeTeachers: SummaryMetric & {
    capacityPercentage: number | null;
  };
  openVacancies: SummaryMetric & {
    averageDaysToClose: number | null;
  };
  todayNews: SummaryMetric & {
    criticalCount: number;
  };
  updatedAt: string;
};

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
  if (scope.kind === "school") {
    return {
      clause: `${aliasAp}.school_id = $${startIdx}`,
      values: [scope.schoolId],
    };
  }
  if (scope.kind === "area") {
    return {
      clause: `COALESCE(${aliasAp}.area_id, ${aliasS}.area_id) = $${startIdx}`,
      values: [scope.areaId],
    };
  }
  return { clause: "TRUE", values: [] };
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

router.get("/dashboard/summary", async (req, res) => {
  try {
    const activeTeachers = await getActiveTeachersCount(req);
    const todayNewsMetrics = await getTodayNewsMetrics(req);

    const payload: DashboardSummaryResponse = {
      activeTeachers: {
        value: activeTeachers,
        trend: 0,
        trendType: "flat",
        detail: "Capacidad total no configurada",
        capacityPercentage: null,
      },
      openVacancies: {
        value: 0,
        trend: 0,
        trendType: "flat",
        detail: "Métrica temporalmente en 0",
        averageDaysToClose: null,
      },
      todayNews: {
        value: todayNewsMetrics.value,
        trend: 0,
        trendType: "flat",
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
