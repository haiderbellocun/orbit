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
      subjects?: number;
      classGroups?: number;
      classPreparations?: number;
      academicLoads?: number;
      projects?: number;
      substantiveFunctions?: number;
    };
    updated: {
      persons: number;
    };
    errors: Array<{
      row: number;
      reason: string;
    }>;
    warnings?: Array<{
      row: number;
      reason: string;
    }>;
    duration_ms: number;
  };
};

/** Listados / lecturas habituales */
const DEFAULT_FETCH_TIMEOUT_MS = 120_000;
/** Solo subida del archivo al POST /import/docentes?async=1; el progreso sigue por SSE */
const IMPORT_UPLOAD_TIMEOUT_MS = 15 * 60 * 1000;

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(tid);
  }
}

function abortErrorMessage(timeoutMs: number): string {
  const min = Math.round(timeoutMs / 60_000);
  return `La solicitud superó el tiempo de espera (${min} min). Comprueba que la API responda y la base de datos no esté bloqueada.`;
}

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

export type AuthUser = {
  id: number;
  personId: number | null;
  email: string;
  name: string;
  roleCode: string | null;
  roleName: string | null;
};

export type GoogleAuthResponse = {
  token: string;
  user: {
    id: number;
    personId: number | null;
    email: string;
    name: string;
    picture?: string;
    roleCode?: string | null;
    roleName?: string | null;
  };
};

export async function loginWithGoogleIdToken(
  idToken: string
): Promise<GoogleAuthResponse> {
  const response = await fetch(`${BASE_URL}/auth/google`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ idToken }),
  });
  return handleJson(response);
}

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
  try {
    const response = await fetchWithTimeout(
      url.toString(),
      { headers: jsonHeaders },
      DEFAULT_FETCH_TIMEOUT_MS
    );
    return handleJson(response);
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(abortErrorMessage(DEFAULT_FETCH_TIMEOUT_MS));
    }
    throw e;
  }
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
  coordinator_document?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/lites`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.school) url.searchParams.set("school", params.school);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.coordinator_document) {
    url.searchParams.set("coordinator_document", params.coordinator_document);
  }
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

/** Evento de progreso emitido por GET /import/docentes/stream (SSE) */
export type ImportStreamProgress = {
  type: "progress";
  phase: string;
  label: string;
  current?: number;
  total?: number;
  percent?: number;
};

/**
 * Abre la conexión SSE y resuelve con el ImportResult final.
 * `onProgress` se invoca con cada evento de fase (validación, CORE, carga actual, proyección, etc.)
 */
function listenImportDocentesStream(
  importId: string,
  onProgress?: (e: ImportStreamProgress) => void
): Promise<ImportTeachersResponse> {
  const url = `${IMPORT_BASE_URL}/import/docentes/stream/${encodeURIComponent(importId)}`;

  return new Promise((resolve, reject) => {
    let finished = false;
    const es = new EventSource(url);

    const cleanup = () => {
      es.close();
    };

    es.onmessage = (ev: MessageEvent<string>) => {
      try {
        const raw = JSON.parse(ev.data) as unknown;
        if (
          typeof raw !== "object" ||
          raw === null ||
          !("type" in raw)
        ) {
          return;
        }
        const item = raw as
          | ImportStreamProgress
          | { type: "complete"; result: ImportTeachersResponse }
          | { type: "error"; message: string };

        if (item.type === "progress") {
          onProgress?.(item);
          return;
        }
        if (item.type === "complete") {
          finished = true;
          cleanup();
          resolve(item.result);
          return;
        }
        if (item.type === "error") {
          finished = true;
          cleanup();
          reject(new Error(item.message || "Error en importación"));
        }
      } catch (err) {
        finished = true;
        cleanup();
        reject(
          err instanceof Error ? err : new Error("Respuesta inválida del servidor")
        );
      }
    };

    es.onerror = () => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(
        new Error(
          "Se perdió la conexión de progreso con la API. Comprueba que el servidor siga en ejecución."
        )
      );
    };
  });
}

// Importacion docentes (async + SSE para ver el proceso en vivo)
export async function importTeachersExcel(
  file: File,
  options?: { onProgress?: (e: ImportStreamProgress) => void }
): Promise<ImportTeachersResponse> {
  const formData = new FormData();
  formData.append("file", file);

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `${IMPORT_BASE_URL}/import/docentes?async=1`,
      {
        method: "POST",
        body: formData,
      },
      IMPORT_UPLOAD_TIMEOUT_MS
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(
        "La subida del archivo tardó demasiado. Prueba un archivo más pequeño o revisa la red."
      );
    }
    throw e;
  }

  if (response.status === 202) {
    const meta = (await response.json()) as { importId?: string };
    if (!meta.importId) {
      throw new Error("Respuesta 202 sin importId");
    }
    return listenImportDocentesStream(meta.importId, options?.onProgress);
  }

  const text = await response.text();
  let data: unknown;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(
      text.trim() || `Error HTTP ${response.status} al importar`
    );
  }

  const isImportShape =
    typeof data === "object" &&
    data !== null &&
    "importId" in data &&
    "summary" in data &&
    typeof (data as { summary?: unknown }).summary === "object" &&
    (data as { summary?: { errors?: unknown } }).summary !== null;

  if (isImportShape) {
    return data as ImportTeachersResponse;
  }

  if (!response.ok) {
    const errObj = data as { error?: string };
    throw new Error(
      errObj.error?.trim() ||
        text.trim() ||
        `Error al importar (HTTP ${response.status})`
    );
  }

  return data as ImportTeachersResponse;
}
