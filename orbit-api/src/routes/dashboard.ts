import { Router, type Request } from "express";
import { pool } from "../db/connection";
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

router.get("/dashboard/summary", async (req, res) => {
  try {
    const activeTeachers = await getActiveTeachersCount(req);

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
        value: 0,
        trend: 0,
        trendType: "flat",
        detail: "Métrica temporalmente en 0",
        criticalCount: 0,
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
