import { DIRECT_MANAGER_IDENTIFICATION_MAX_LENGTH } from "../dataValidators";

/** Estados operativos válidos de una vacante. */
export const OPERATION_STATUSES = new Set([
  "open",
  "selected",
  "requisition_sent",
  "internal_movement",
  "hired",
  "closed",
  "cancelled",
  "cancelled_by_capital",
]);

/** Estados finales admitidos por PATCH /vacancies/:id/close. */
export const CLOSE_STATUSES = new Set([
  "hired",
  "closed",
  "cancelled",
  "cancelled_by_capital",
]);

/** La vacante ya no admite cambios (salvo por un admin). */
export const FULLY_LOCKED_STATUSES = new Set([
  "hired",
  "closed",
  "cancelled",
  "cancelled_by_capital",
]);

/** Estados en los que no se puede editar la requisición (sí en `hired`). */
export const REQUISITION_BLOCKED_STATUSES = new Set([
  "closed",
  "cancelled",
  "cancelled_by_capital",
]);

export const VACANCY_FULLY_LOCKED_MESSAGE =
  "Esta vacante está contratada, cerrada, cancelada o cancelada por capital y no puede modificarse.";

export const REQUISITION_LOCKED_MESSAGE =
  "Esta vacante está cerrada o cancelada y la requisición no puede modificarse.";

export const CORE_CATALOG_UNAVAILABLE_MESSAGE =
  "CORE catalog (area/school/program) is not available";

export const REQ_NUMBER_TAKEN_MESSAGE =
  "El número REQ ya está en uso; cada requisición debe tener un número único.";

/** `null` = puede editarse. */
export type VacancyEditGate = "missing" | "blocked" | null;

export function directManagerIdentificationError(
  reason: "too_long" | "invalid"
): string {
  if (reason === "too_long") {
    return `El nombre del jefe inmediato no puede superar ${DIRECT_MANAGER_IDENTIFICATION_MAX_LENGTH} caracteres.`;
  }
  return "Valor inválido para nombre del jefe inmediato.";
}

export function isConfirmTextValid(text: unknown): boolean {
  return typeof text === "string" && text.trim().toLowerCase() === "confirmar";
}

export function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s
  );
}

export function parseOptionalBool(v: unknown): boolean | null {
  if (v === undefined) return null;
  if (v === null) return null;
  if (typeof v === "boolean") return v;
  return null;
}

export function numOrUndef(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (v === null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function hiredQuantityRangeError(
  hiredQty: number,
  quantity: number
): string | null {
  if (!Number.isFinite(hiredQty) || hiredQty < 0) {
    return "hiredQuantity debe ser un número mayor o igual a 0.";
  }
  if (hiredQty > quantity) {
    return "La cantidad contratada no puede superar la cantidad solicitada.";
  }
  return null;
}

export function hiredQuantityRequiredForHiredError(): string {
  return "Al marcar como contratado debe indicar cuántas personas se contrataron (mínimo 1).";
}

/**
 * Resuelve `hired_quantity` al pasar una vacante a `hired`.
 *
 * Extrae la regla que PATCH /:id/close y PATCH /:id/admin-status aplicaban
 * con bloques idénticos: sin valor entrante se conserva el actual solo si la
 * vacante ya estaba contratada; en caso contrario es obligatorio y debe caber
 * en la cantidad solicitada.
 */
export function resolveHiredQuantityForHired(input: {
  incoming: number | undefined;
  previousStatus: string;
  currentHired: number;
  currentQuantity: number;
}): { ok: true; value: number } | { ok: false; error: string } {
  const { incoming, previousStatus, currentHired, currentQuantity } = input;
  if (incoming === undefined) {
    if (previousStatus === "hired" && currentHired > 0) {
      return { ok: true, value: currentHired };
    }
    return { ok: false, error: hiredQuantityRequiredForHiredError() };
  }
  if (incoming < 1) {
    return { ok: false, error: hiredQuantityRequiredForHiredError() };
  }
  const rangeErr = hiredQuantityRangeError(incoming, currentQuantity);
  if (rangeErr != null) return { ok: false, error: rangeErr };
  return { ok: true, value: incoming };
}

export function vacancyChangeLogActionLabel(
  action: string,
  details: Record<string, unknown>
): string {
  const actionType = String(details.actionType ?? "");
  if (actionType === "admin_status_change") return "Cambio de estado (admin)";
  if (action === "DELETE") return "Eliminación total";
  if (action === "INSERT") return "Creación de vacante";
  if (details.requisitionPatch != null || details.reqNumber != null) {
    return "Actualización de requisición";
  }
  if (details.operationNoteAppended === true) return "Comentario de operación";
  if (details.operationStatus != null) return "Cambio de estado";
  if (action === "UPDATE") return "Actualización de vacante";
  return "Registro de actividad";
}
