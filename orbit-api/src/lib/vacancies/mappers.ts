import { validateDocument } from "../dataValidators";

export type VacancyOperationNoteDto = {
  id: string;
  text: string;
  createdAt: string;
  createdByPersonId: number | null;
  createdByName: string | null;
};

/** ISO 8601, o `""` cuando la columna viene nula. */
function isoOrEmpty(value: unknown): string {
  return value != null ? new Date(value as string | Date).toISOString() : "";
}

/** ISO 8601, o `null` cuando la columna viene nula. */
function isoOrNull(value: unknown): string | null {
  return value == null ? null : new Date(value as string | Date).toISOString();
}

function numOrNull(value: unknown): number | null {
  return value == null ? null : Number(value);
}

function strOrNull(value: unknown): string | null {
  return value == null ? null : String(value);
}

/** `null` salvo que la columna traiga texto no vacío. */
function nonEmptyStrOrNull(value: unknown): string | null {
  return value == null || String(value).trim() === "" ? null : String(value);
}

function boolOrNull(value: unknown): boolean | null {
  return value === null || value === undefined ? null : Boolean(value);
}

export function mapComplianceFields(row: Record<string, unknown>) {
  return {
    shortlistComplied: boolOrNull(row.shortlist_complied),
    pdaComplied: boolOrNull(row.pda_complied),
    contractConditionsComplied: boolOrNull(row.contract_conditions_complied),
    preInterviewCvComplied: boolOrNull(row.pre_interview_cv_complied),
  };
}

export function mapVacancyRow(
  row: Record<string, unknown>,
  operationNotes: VacancyOperationNoteDto[]
) {
  return {
    id: String(row.id),
    publicId: numOrNull(row.public_id),
    areaId: Number(row.area_id),
    schoolId: numOrNull(row.school_id),
    programId: numOrNull(row.program_id),
    positionName: String(row.position_name ?? ""),
    curricularLine: strOrNull(row.curricular_line),
    directManagerIdentification: validateDocument(
      row.direct_manager_identification
    ),
    quantity: Number(row.quantity ?? 0),
    hiredQuantity: Number(row.hired_quantity ?? 0),
    operationNotes,
    ...mapComplianceFields(row),
    operationStatus: String(row.operation_status ?? "open"),
    createdAt: isoOrEmpty(row.created_at),
    updatedAt: row.updated_at != null ? isoOrEmpty(row.updated_at) : undefined,
    closedAt: isoOrNull(row.closed_at),
  };
}

export function mapListRow(row: Record<string, unknown>) {
  const base = mapVacancyRow(row, mapNotesFromJsonRaw(row.operation_notes_json));
  return {
    ...base,
    areaName: String(row.area_name ?? ""),
    schoolName: String(row.school_name ?? ""),
    programName: row.program_id == null ? null : String(row.program_name ?? ""),
    reqNumber: strOrNull(row.req_number),
    reqAssignedAt: isoOrNull(row.req_assigned_at),
    sentToCapitalAt: isoOrNull(row.sent_to_capital_at),
    capitalNotes: nonEmptyStrOrNull(row.requisition_capital_notes),
  };
}

export type VacancyListItem = ReturnType<typeof mapListRow>;

/** Requisición embebida en GET /vacancies/:id (`null` si la vacante no tiene). */
export function mapRequisition(raw: Record<string, unknown>) {
  if (raw.requisition_id == null) return null;
  return {
    id: String(raw.requisition_id),
    reqNumber: strOrNull(raw.req_number),
    assignedAt: isoOrEmpty(raw.req_assigned_at),
    sentToCapitalAt: isoOrNull(raw.sent_to_capital_at),
    capitalNotes: nonEmptyStrOrNull(raw.requisition_capital_notes),
    ...mapComplianceFields(raw),
  };
}

/** Notas agregadas por `sqlOperationNotesAgg`; json o texto según el driver. */
export function mapNotesFromJsonRaw(raw: unknown): VacancyOperationNoteDto[] {
  if (raw == null) return [];
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const out: VacancyOperationNoteDto[] = [];
  for (const item of parsed) {
    if (item == null || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = o.id != null ? String(o.id) : "";
    const text = o.text != null ? String(o.text) : "";
    if (id === "" || text === "") continue;
    const cbp = o.createdByPersonId ?? o.created_by_person_id;
    const createdByPersonId = cbp == null || cbp === "" ? null : Number(cbp);
    out.push({
      id,
      text,
      createdAt: isoOrEmpty(o.createdAt ?? o.created_at),
      createdByPersonId:
        createdByPersonId != null && Number.isFinite(createdByPersonId)
          ? createdByPersonId
          : null,
      createdByName: nonEmptyStrOrNull(o.createdByName ?? o.created_by_name),
    });
  }
  return out;
}

export function mapOperationNoteRow(
  row: Record<string, unknown>
): VacancyOperationNoteDto {
  return {
    id: String(row.id),
    text: String(row.body ?? ""),
    createdAt: isoOrEmpty(row.created_at),
    createdByPersonId: numOrNull(row.created_by_person_id),
    createdByName: strOrNull(row.created_by_name),
  };
}

export function mapStatusHistoryRow(row: Record<string, unknown>) {
  return {
    id: String(row.id),
    previousOperationStatus: strOrNull(row.previous_operation_status),
    newOperationStatus: String(row.new_operation_status ?? ""),
    changedAt: isoOrEmpty(row.changed_at),
    changedByPersonId: numOrNull(row.changed_by_person_id),
  };
}
