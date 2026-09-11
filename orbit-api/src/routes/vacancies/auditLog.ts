import { Router } from "express";
import { pool } from "../../db/connection";
import { resolveCoreSchemaMode } from "../../lib/coreSchema";
import { coreTables } from "../../lib/vacancies/repository";
import { vacancyChangeLogActionLabel } from "../../lib/vacancies/rules";
import { denyUnlessVacancyInformativePanel, route } from "./guards";

const router = Router();

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function parseLimit(raw: unknown): number {
  const n = Number.parseInt(String(raw ?? DEFAULT_LIMIT), 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_LIMIT) : DEFAULT_LIMIT;
}

function trimmedQuery(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** GET /vacancies/audit-log — panel informativo (roles 37, 38) */
router.get(
  "/vacancies/audit-log",
  route("GET /vacancies/audit-log", async (req, res) => {
    if (denyUnlessVacancyInformativePanel(req, res)) return;

    const mode = await resolveCoreSchemaMode();
    const tables = mode != null ? coreTables(mode) : null;
    const limit = parseLimit(req.query.limit);
    const qSearch = trimmedQuery(req.query.q).toLowerCase();
    const fromDate = trimmedQuery(req.query.from);
    const toDate = trimmedQuery(req.query.to);

    const actorJoin =
      tables != null
        ? `LEFT JOIN ${tables.person} per ON per.id = l.created_by_person_id`
        : "";
    const vacancyJoin =
      tables != null
        ? `LEFT JOIN vacancies.vacancy v ON v.id = l.entity_id
           LEFT JOIN ${tables.area} a ON a.id = v.area_id
           LEFT JOIN ${tables.school} s ON s.id = v.school_id`
        : `LEFT JOIN vacancies.vacancy v ON v.id = l.entity_id`;

    const { rows } = await pool.query(
      `SELECT
         l.id,
         l.action,
         l.details,
         l.created_at,
         l.created_by_person_id,
         l.entity_id,
         v.public_id AS live_public_id,
         v.position_name AS live_position_name,
         a.name AS live_area_name,
         s.name AS live_school_name,
         per.full_name AS actor_name
       FROM vacancies.vacancy_change_log l
       ${vacancyJoin}
       ${actorJoin}
       ORDER BY l.created_at DESC
       LIMIT $1`,
      [limit]
    );

    const data = rows
      .map((raw) => {
        const row = raw as Record<string, unknown>;
        const details =
          row.details != null && typeof row.details === "object"
            ? (row.details as Record<string, unknown>)
            : {};
        const action = String(row.action ?? "");

        // La vacante viva manda; si fue eliminada se cae al snapshot auditado.
        const positionName =
          row.live_position_name != null
            ? String(row.live_position_name)
            : String(details.positionName ?? "");
        const areaName =
          row.live_area_name != null
            ? String(row.live_area_name)
            : String(details.areaName ?? "");
        const vacancyPublicId =
          row.live_public_id != null
            ? Number(row.live_public_id)
            : details.vacancyPublicId != null
              ? Number(details.vacancyPublicId)
              : null;
        const reqNumber =
          details.reqNumber != null ? String(details.reqNumber) : null;
        const createdAt =
          row.created_at != null
            ? new Date(row.created_at as string | Date).toISOString()
            : "";
        const actionLabel = vacancyChangeLogActionLabel(action, details);

        if (fromDate && createdAt.slice(0, 10) < fromDate) return null;
        if (toDate && createdAt.slice(0, 10) > toDate) return null;

        if (qSearch) {
          const hay = [
            positionName,
            areaName,
            reqNumber ?? "",
            vacancyPublicId != null ? String(vacancyPublicId) : "",
            actionLabel,
          ]
            .join(" ")
            .toLowerCase();
          if (!hay.includes(qSearch)) return null;
        }

        return {
          id: String(row.id),
          createdAt,
          action,
          actionLabel,
          vacancyPublicId,
          positionName,
          areaName,
          schoolName:
            row.live_school_name != null
              ? String(row.live_school_name)
              : details.schoolName != null
                ? String(details.schoolName)
                : null,
          reqNumber,
          actorName:
            row.actor_name != null && String(row.actor_name).trim() !== ""
              ? String(row.actor_name)
              : null,
          details,
          vacancyDeleted: row.entity_id == null && action === "DELETE",
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null);

    res.json({ data });
  })
);

export default router;
