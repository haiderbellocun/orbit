import { Router, type Request } from "express";
import { schoolScopeFromRequest } from "../../middleware/orbitAuth";
import {
  buildVacanciesWorkbook,
  vacanciesExportFilename,
} from "../../services/vacancyExcelExport";
import { mapListRow, type VacancyListItem } from "../../lib/vacancies/mappers";
import { loadVacancyList } from "../../lib/vacancies/repository";
import { requireCoreSchema, route } from "./guards";

const router = Router();

function queryString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function vacancyDayValue(
  v: VacancyListItem,
  field: "createdAt" | "sentToCapitalAt"
): string | null {
  const raw = field === "createdAt" ? v.createdAt : v.sentToCapitalAt;
  if (!raw?.trim()) return null;
  return raw.slice(0, 10);
}

const STATUS_LABELS: Record<string, string> = {
  open: "Abierta",
  selected: "Seleccionado",
  requisition_sent: "Requisición Enviada",
  internal_movement: "Movimiento interno",
  hired: "Contratado",
  closed: "Cerrada",
  cancelled: "Cancelada",
  cancelled_by_capital: "Cancelada por capital",
};

/** Filtra en memoria el listado ya mapeado y describe los filtros para la hoja. */
function filterVacanciesForExport(
  rows: VacancyListItem[],
  q: Request["query"]
): { rows: VacancyListItem[]; summary: string } {
  const search = queryString(q.search ?? q.q).toLowerCase();
  const status = queryString(q.status);
  const areaId = queryString(q.areaId);
  const schoolId = queryString(q.schoolId);
  const programId = queryString(q.programId);
  const dateField: "createdAt" | "sentToCapitalAt" =
    queryString(q.dateField) === "sentToCapitalAt"
      ? "sentToCapitalAt"
      : "createdAt";
  const dateFrom = queryString(q.dateFrom);
  const dateTo = queryString(q.dateTo);

  const areaName = areaId
    ? rows.find((v) => String(v.areaId) === areaId)?.areaName
    : null;
  const schoolName = schoolId
    ? rows.find((v) => String(v.schoolId ?? "") === schoolId)?.schoolName
    : null;
  const programName = programId
    ? rows.find((v) => String(v.programId ?? "") === programId)?.programName
    : null;

  const parts: string[] = [];
  if (search) parts.push(`Búsqueda: "${queryString(q.search ?? q.q)}"`);
  if (status) parts.push(`Estado: ${STATUS_LABELS[status] ?? status}`);
  if (areaId) parts.push(`Área: ${areaName || areaId}`);
  if (schoolId) parts.push(`Escuela: ${schoolName || schoolId}`);
  if (programId) parts.push(`Programa: ${programName || programId}`);
  if (dateFrom || dateTo) {
    const fieldLabel =
      dateField === "sentToCapitalAt" ? "enviada a capital" : "creación";
    parts.push(`Fecha ${fieldLabel}: ${dateFrom || "…"} → ${dateTo || "…"}`);
  }

  const filtered = rows.filter((v) => {
    if (status && v.operationStatus !== status) return false;
    if (areaId && String(v.areaId) !== areaId) return false;
    if (schoolId && String(v.schoolId ?? "") !== schoolId) return false;
    if (programId && String(v.programId ?? "") !== programId) return false;
    if (dateFrom || dateTo) {
      const day = vacancyDayValue(v, dateField);
      if (!day) return false;
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
    }
    if (!search) return true;
    return (
      v.positionName.toLowerCase().includes(search) ||
      (v.programName ?? "").toLowerCase().includes(search) ||
      (v.areaName ?? "").toLowerCase().includes(search) ||
      (v.schoolName ?? "").toLowerCase().includes(search) ||
      v.id.toLowerCase().includes(search) ||
      (v.reqNumber ?? "").toLowerCase().includes(search)
    );
  });

  return { rows: filtered, summary: parts.length > 0 ? parts.join(" · ") : "" };
}

function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

/** GET /vacancies */
router.get(
  "/vacancies",
  route("GET /vacancies", async (req, res) => {
    const core = await requireCoreSchema(res);
    if (core == null) return;

    const scope = schoolScopeFromRequest(req);
    const rows = await loadVacancyList(core.tables, scope?.schoolId ?? null);
    res.json({ data: rows.map(mapListRow) });
  })
);

/** GET /vacancies/export.xlsx — Excel con tabla "Vacantes" (antes de /vacancies/:id). */
router.get(
  "/vacancies/export.xlsx",
  route("GET /vacancies/export.xlsx", async (req, res) => {
    const core = await requireCoreSchema(res);
    if (core == null) return;

    const scope = schoolScopeFromRequest(req);
    const rows = await loadVacancyList(core.tables, scope?.schoolId ?? null);
    const { rows: filtered, summary } = filterVacanciesForExport(
      rows.map(mapListRow),
      req.query
    );

    const buffer = await buildVacanciesWorkbook(filtered, {
      generatedByName: req.orbitUser?.name ?? null,
      generatedByEmail: req.orbitUser?.email ?? null,
      filtersSummary: summary,
    });
    const filename = vacanciesExportFilename();
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", contentDispositionAttachment(filename));
    res.send(buffer);
  })
);

export default router;
