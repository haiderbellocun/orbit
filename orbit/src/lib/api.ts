import type { Teacher } from "@/src/types";

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ??
  "http://localhost:4000/api";
const IMPORT_BASE_URL =
  (import.meta.env.VITE_IMPORT_API_URL as string | undefined) ??
  "http://localhost:4000/api";

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PaginatedResponse<T = unknown> = {
  data: T[];
  pagination: PaginationMeta;
};

export type ImportTeachersResponse = {
  success: boolean;
  importId: string;
  summary: {
    totalRows: number;
    processedRows: number;
    skippedRows: number;
    created: {
      persons: number;
      contractTypes: number;
      roles: number;
      cities: number;
      schools: number;
      programs: number;
    };
    updated: {
      persons: number;
    };
    errors: Array<{
      row: number;
      reason: string;
    }>;
    duration_ms: number;
  };
};

export type DashboardTrendType = "up" | "down" | "flat";

export type DashboardSummaryMetric = {
  value: number;
  trend: number;
  trendType: DashboardTrendType;
  detail: string;
};

export type DashboardSummaryResponse = {
  activeTeachers: DashboardSummaryMetric & {
    capacityPercentage: number | null;
  };
  openVacancies: DashboardSummaryMetric & {
    averageDaysToClose: number | null;
  };
  todayNews: DashboardSummaryMetric & {
    criticalCount: number;
  };
  updatedAt: string;
};

async function handleJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await response.text().catch(() => `HTTP ${response.status}`));
  }
  return response.json() as Promise<T>;
}

const jsonHeaders = { "Content-Type": "application/json" };

// Teachers
export async function getTeachers(params?: {
  search?: string;
  status?: string;
  program?: string;
  campus?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/teachers`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.program) url.searchParams.set("program", params.program);
  if (params?.campus) url.searchParams.set("campus", params.campus);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await fetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getTeacher(id: number): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/teachers/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getTeacherByDocument(
  document: string
): Promise<unknown> {
  const url = new URL(`${BASE_URL}/teachers`);
  url.searchParams.set("search", document);
  url.searchParams.set("limit", "1");
  const res = await fetch(url.toString(), { headers: jsonHeaders });
  if (!res.ok) throw new Error("Error");
  const data = (await res.json()) as { data?: unknown[] };
  return data.data?.[0] ?? null;
}

export async function createTeacher(data: Partial<Teacher>): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/teachers`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function updateTeacher(
  id: number,
  data: Partial<Teacher>
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/teachers/${id}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

// Vacancies
export async function getVacancies(params?: {
  status?: string;
  program?: string;
  campus?: string;
  period?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/vacancies`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.program) url.searchParams.set("program", params.program);
  if (params?.campus) url.searchParams.set("campus", params.campus);
  if (params?.period) url.searchParams.set("period", params.period);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await fetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getVacancy(id: number): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/vacancies/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function createVacancy(data: unknown): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/vacancies`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function updateVacancy(id: number, data: unknown): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/vacancies/${id}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

// Coordinators
export async function getCoordinators(params?: {
  status?: string;
  campus?: string;
}): Promise<unknown[]> {
  const url = new URL(`${BASE_URL}/coordinators`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.campus) url.searchParams.set("campus", params.campus);
  const response = await fetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getCoordinator(id: number): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/coordinators/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

// Reinstatements
export async function getReinstatements(params?: {
  status?: string;
  decision?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/reinstatements`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.decision) url.searchParams.set("decision", params.decision);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await fetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function updateReinstatement(
  id: number,
  data: unknown
): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/reinstatements/${id}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

// LITEs
export async function getLites(params?: {
  search?: string;
  school?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/lites`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.school) url.searchParams.set("school", params.school);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await fetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

// Carga académica
export async function getAcademicLoad(params?: {
  teacher_document?: string;
  period?: string;
  unit_name?: string;
  modality?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/academic-load`);
  if (params?.teacher_document) {
    url.searchParams.set("teacher_document", params.teacher_document);
  }
  if (params?.period) url.searchParams.set("period", params.period);
  if (params?.unit_name) url.searchParams.set("unit_name", params.unit_name);
  if (params?.modality) url.searchParams.set("modality", params.modality);
  if (params?.type) url.searchParams.set("type", params.type);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await fetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getAcademicLoadSummary(): Promise<unknown> {
  const response = await fetch(`${BASE_URL}/academic-load/summary`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getTeacherAcademicLoad(document: string): Promise<unknown> {
  const enc = encodeURIComponent(document);
  const response = await fetch(`${BASE_URL}/academic-load/teacher/${enc}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

// Dashboard
export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  const response = await fetch(`${BASE_URL}/dashboard/summary`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

// Importacion docentes
export async function importTeachersExcel(
  file: File
): Promise<ImportTeachersResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${IMPORT_BASE_URL}/import/docentes`, {
    method: "POST",
    body: formData,
  });

  return handleJson(response);
}
