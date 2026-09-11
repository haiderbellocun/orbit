import type {
  Vacancy,
  VacancyDetail,
  VacancyOperationNoteEntry,
  VacancyOperationStatus,
} from "@/src/types";
import { BASE_URL } from "./config";
import {
  apiUrl,
  assertResponseOk,
  authFetch,
  handleJson,
  jsonHeaders,
} from "./http";

// Vacancies (schema `vacancies.vacancy`)
export type CreateVacancyPayload = {
  areaId: number;
  /** Opcional; si hay `programId`, la API infiere la escuela desde el programa. */
  schoolId?: number | null;
  programId: number | null;
  positionName: string;
  curricularLine?: string | null;
  /** Nombre del jefe inmediato (opcional). */
  directManagerIdentification?: string | null;
  quantity: number;
  /** Primer comentario de operación (opcional). */
  operationNotes?: string | null;
};

export type PatchVacancyPayload = Partial<{
  areaId: number;
  schoolId: number | null;
  programId: number | null;
  positionName: string;
  curricularLine: string | null;
  directManagerIdentification?: string | null;
  quantity: number;
  hiredQuantity?: number;
  operationStatus: VacancyOperationStatus;
  closedAt: string | null;
}>;

export type VacanciesListResponse = { data: Vacancy[] };

export async function getVacancies(): Promise<VacanciesListResponse> {
  const response = await authFetch(`${BASE_URL}/vacancies`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export type VacanciesExcelExportParams = {
  search?: string;
  status?: string;
  areaId?: string;
  schoolId?: string;
  programId?: string;
  dateField?: "createdAt" | "sentToCapitalAt";
  dateFrom?: string;
  dateTo?: string;
};

function filenameFromContentDisposition(
  header: string | null,
  fallback: string
): string {
  if (!header) return fallback;
  const star = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      /* ignore */
    }
  }
  const plain = header.match(/filename="([^"]+)"/i) ?? header.match(/filename=([^;]+)/i);
  return plain?.[1]?.trim() || fallback;
}

/** Descarga Excel de vacantes (tabla "Vacantes", respeta filtros). */
export async function downloadVacanciesExcel(
  params?: VacanciesExcelExportParams
): Promise<void> {
  const response = await authFetch(
    apiUrl("/vacancies/export.xlsx", {
      search: params?.search?.trim(),
      status: params?.status?.trim(),
      areaId: params?.areaId?.trim(),
      schoolId: params?.schoolId?.trim(),
      programId: params?.programId?.trim(),
      dateField: params?.dateField,
      dateFrom: params?.dateFrom?.trim(),
      dateTo: params?.dateTo?.trim(),
    })
  );
  await assertResponseOk(response);
  const blob = await response.blob();
  const filename = filenameFromContentDisposition(
    response.headers.get("Content-Disposition"),
    "Gestion_de_Vacantes.xlsx"
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function getVacancy(id: string): Promise<VacancyDetail> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}`,
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export async function createVacancy(
  data: CreateVacancyPayload
): Promise<Vacancy> {
  const response = await authFetch(`${BASE_URL}/vacancies`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function patchVacancy(
  id: string,
  data: PatchVacancyPayload
): Promise<Vacancy> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(data),
    }
  );
  return handleJson(response);
}

export async function appendVacancyOperationNote(
  id: string,
  body: { text: string }
): Promise<{ note: VacancyOperationNoteEntry }> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}/operation-notes`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }
  );
  return handleJson(response);
}

export async function createVacancyRequisition(
  id: string,
  body: {
    reqNumber?: string | null;
    sentToCapitalAt?: string | null;
    capitalNotes?: string | null;
    shortlistComplied?: boolean | null;
    pdaComplied?: boolean | null;
    contractConditionsComplied?: boolean | null;
    preInterviewCvComplied?: boolean | null;
  }
): Promise<Vacancy> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}/requisition`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }
  );
  return handleJson(response);
}

export async function patchVacancyRequisition(
  id: string,
  body: {
    reqNumber?: string | null;
    capitalNotes?: string | null;
    sentToCapitalAt?: string | null;
    shortlistComplied?: boolean | null;
    pdaComplied?: boolean | null;
    contractConditionsComplied?: boolean | null;
    preInterviewCvComplied?: boolean | null;
  }
): Promise<Vacancy> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}/requisition`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }
  );
  return handleJson(response);
}

export async function closeVacancy(
  id: string,
  body?: {
    operationStatus?:
      | "hired"
      | "closed"
      | "cancelled"
      | "cancelled_by_capital";
    hiredQuantity?: number;
  }
): Promise<Vacancy> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}/close`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(body ?? {}),
    }
  );
  return handleJson(response);
}

export async function deleteVacancy(
  id: string,
  body: { confirmText: string }
): Promise<{ ok: boolean }> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }
  );
  return handleJson(response);
}

export async function patchVacancyAdminStatus(
  id: string,
  body: {
    operationStatus: VacancyOperationStatus;
    confirmText: string;
    hiredQuantity?: number;
  }
): Promise<Vacancy> {
  const response = await authFetch(
    `${BASE_URL}/vacancies/${encodeURIComponent(id)}/admin-status`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(body),
    }
  );
  return handleJson(response);
}

export type VacancyAuditLogEntry = {
  id: string;
  createdAt: string;
  action: string;
  actionLabel: string;
  vacancyPublicId: number | null;
  positionName: string;
  areaName: string;
  schoolName: string | null;
  reqNumber: string | null;
  actorName: string | null;
  details: Record<string, unknown>;
  vacancyDeleted: boolean;
};

export async function getVacancyAuditLog(params?: {
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<{ data: VacancyAuditLogEntry[] }> {
  const response = await authFetch(
    apiUrl("/vacancies/audit-log", {
      q: params?.q,
      from: params?.from,
      to: params?.to,
      limit: params?.limit,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}
