import type {
  Teacher,
  Vacancy,
  VacancyDetail,
  VacancyOperationNoteEntry,
  VacancyOperationStatus,
} from "@/src/types";

const DEFAULT_API_BASE = "http://localhost:4000/api";

/** Asegura prefijo `/api` cuando solo se pasó el origen (p. ej. `https://….run.app`). */
function normalizeOrbitApiBase(raw: string | undefined, fallback: string): string {
  const s = (raw ?? "").trim();
  if (!s) return fallback;
  try {
    const u = new URL(s);
    let path = u.pathname || "/";
    path = path.replace(/\/+$/, "") || "/";
    if (path === "/") {
      return `${u.origin}/api`;
    }
    return `${u.origin}${path}`;
  } catch {
    return fallback;
  }
}

const BASE_URL = normalizeOrbitApiBase(
  import.meta.env.VITE_API_URL as string | undefined,
  DEFAULT_API_BASE
);
/** Por defecto igual que la API; solo define `VITE_IMPORT_API_URL` si el import debe ir a otro host. */
const IMPORT_BASE_URL = normalizeOrbitApiBase(
  import.meta.env.VITE_IMPORT_API_URL as string | undefined,
  BASE_URL
);

/**
 * El import por multipart no puede ir al mismo host que el SPA si ese host es solo nginx estático
 * (p. ej. Cloud Run `orbit-frontend`): devuelve 413. Mismo host con reverse proxy a Express: `VITE_ALLOW_SAME_ORIGIN_API=true`.
 */
function assertImportUsesBackendHost(apiBase: string): void {
  if (!import.meta.env.PROD || typeof window === "undefined") return;
  if (import.meta.env.VITE_ALLOW_SAME_ORIGIN_API === "true") return;
  let host: string;
  try {
    host = new URL(apiBase).hostname;
  } catch {
    return;
  }
  if (host === window.location.hostname) {
    throw new Error(
      "La importación está configurada contra el mismo host que esta página. En Cloud Run el frontend suele ser solo nginx: usa en el build VITE_API_URL con la URL del servicio backend (p. ej. https://orbit-backend-…us-central1.run.app/api), no la del frontend. Luego reconstruye y redespliega."
    );
  }
}

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
    academicSourceRows?: {
      cargaActual: number;
      proyeccion: number;
    };
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

export type OrbitAccess = "lite" | "full" | "school";

export const ORBIT_JWT_STORAGE_KEY = "orbit_jwt";
export const ORBIT_USER_STORAGE_KEY = "orbit_user";

function getStoredJwt(): string | null {
  if (typeof localStorage === "undefined") return null;
  const t = localStorage.getItem(ORBIT_JWT_STORAGE_KEY)?.trim();
  return t && t.length > 0 ? t : null;
}

export function clearOrbitSession(): void {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(ORBIT_JWT_STORAGE_KEY);
  localStorage.removeItem(ORBIT_USER_STORAGE_KEY);
}

function withAuth(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers ?? undefined);
  const token = getStoredJwt();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return { ...init, headers };
}

function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, withAuth(init));
}

function parseJwtPayload(token: string): {
  exp: number;
  orbitAccess?: string;
  capabilities?: string[];
} | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad)) as {
      exp?: number;
      orbitAccess?: string;
      capabilities?: unknown;
    };
    if (typeof payload.exp !== "number") return null;
    const capabilities = Array.isArray(payload.capabilities)
      ? payload.capabilities.filter((c): c is string => typeof c === "string")
      : undefined;
    return { exp: payload.exp, orbitAccess: payload.orbitAccess, capabilities };
  } catch {
    return null;
  }
}

function parseStoredUserCapabilities(): string[] | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ORBIT_USER_STORAGE_KEY);
    if (!raw) return null;
    const u = JSON.parse(raw) as { capabilities?: unknown };
    if (!Array.isArray(u.capabilities)) return null;
    const caps = u.capabilities.filter((c): c is string => typeof c === "string");
    return caps.length > 0 ? caps : null;
  } catch {
    return null;
  }
}

/** Sesión local válida (JWT con orbitAccess, capabilities y no expirado en ~30s). */
export function isStoredJwtValid(): boolean {
  const token = getStoredJwt();
  if (!token) return false;
  const p = parseJwtPayload(token);
  if (p == null) return false;
  if (
    p.orbitAccess !== "lite" &&
    p.orbitAccess !== "full" &&
    p.orbitAccess !== "school"
  ) {
    return false;
  }
  const caps =
    (p.capabilities && p.capabilities.length > 0
      ? p.capabilities
      : parseStoredUserCapabilities()) ?? [];
  if (caps.length === 0) return false;
  return p.exp * 1000 > Date.now() + 30_000;
}

export function getStoredCapabilities(): string[] {
  const fromUser = parseStoredUserCapabilities();
  if (fromUser && fromUser.length > 0) return fromUser;
  const token = getStoredJwt();
  const p = token ? parseJwtPayload(token) : null;
  if (p?.capabilities && p.capabilities.length > 0) return p.capabilities;
  return [];
}

export function getStoredOrbitAccess(): OrbitAccess | null {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(ORBIT_USER_STORAGE_KEY);
      if (raw) {
        const u = JSON.parse(raw) as { orbitAccess?: string };
        if (
          u.orbitAccess === "lite" ||
          u.orbitAccess === "full" ||
          u.orbitAccess === "school"
        ) {
          return u.orbitAccess;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const token = getStoredJwt();
  const p = token ? parseJwtPayload(token) : null;
  if (
    p?.orbitAccess === "lite" ||
    p?.orbitAccess === "full" ||
    p?.orbitAccess === "school"
  ) {
    return p.orbitAccess;
  }
  return null;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...withAuth(init),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(tid);
  }
}

function abortErrorMessage(timeoutMs: number): string {
  const sec = Math.round(timeoutMs / 1000);
  if (sec < 120) {
    return `La solicitud superó el tiempo de espera (${sec}s). Comprueba que la API responda y que la base de datos sea alcanzable desde Cloud Run (p. ej. conector Cloud SQL en DB_HOST).`;
  }
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
  if (response.status === 401) {
    clearOrbitSession();
  }
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    const text = await response.text().catch(() => "");
    try {
      const j = JSON.parse(text) as { error?: string };
      if (typeof j.error === "string" && j.error.trim() !== "") msg = j.error.trim();
      else if (text.trim()) msg = text.trim();
    } catch {
      if (text.trim()) msg = text.trim();
    }
    throw new Error(msg);
  }
  return response.json() as Promise<T>;
}

const jsonHeaders = { "Content-Type": "application/json" };

/** Login sin JWT previo: timeout acotado para no quedar en spinner infinito si la API/DB cuelgan. */
const AUTH_LOGIN_TIMEOUT_MS = 60_000;

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
    roleId?: number | null;
    roleCode?: string | null;
    roleName?: string | null;
    orbitAccess?: OrbitAccess;
    capabilities?: string[];
  };
};

export async function loginWithGoogleIdToken(
  idToken: string
): Promise<GoogleAuthResponse> {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/auth/google`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ idToken }),
      },
      AUTH_LOGIN_TIMEOUT_MS
    );
    return handleJson(response);
  } catch (e: unknown) {
    if (
      (e instanceof DOMException && e.name === "AbortError") ||
      (typeof e === "object" &&
        e !== null &&
        "name" in e &&
        (e as { name: string }).name === "AbortError")
    ) {
      throw new Error(abortErrorMessage(AUTH_LOGIN_TIMEOUT_MS));
    }
    throw e;
  }
}

/** Solo para desarrollo local: mismo JWT que Google, sin idToken. */
export async function loginWithLocalEmail(
  email: string
): Promise<GoogleAuthResponse> {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}/auth/local-email`,
      {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({ email: email.trim() }),
      },
      AUTH_LOGIN_TIMEOUT_MS
    );
    return handleJson(response);
  } catch (e: unknown) {
    if (
      (e instanceof DOMException && e.name === "AbortError") ||
      (typeof e === "object" &&
        e !== null &&
        "name" in e &&
        (e as { name: string }).name === "AbortError")
    ) {
      throw new Error(abortErrorMessage(AUTH_LOGIN_TIMEOUT_MS));
    }
    throw e;
  }
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
  const response = await authFetch(`${BASE_URL}/teachers/${id}`, {
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
  const res = await authFetch(url.toString(), { headers: jsonHeaders });
  if (res.status === 401) {
    clearOrbitSession();
  }
  if (!res.ok) throw new Error("Error");
  const data = (await res.json()) as { data?: unknown[] };
  return data.data?.[0] ?? null;
}

export async function createTeacher(data: Partial<Teacher>): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/teachers`, {
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
  const response = await authFetch(`${BASE_URL}/teachers/${id}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

/** CORE / legado: actualiza solo is_active (person o teachers.status). */
export async function patchTeacherActive(
  id: number,
  is_active: boolean
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/teachers/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ is_active }),
  });
  return handleJson(response);
}

/** CORE (person): coordinador + program_id; docente también `programs_id` + `academic_line` → `person_program_assignments`. */
export async function updateTeacherProfile(
  id: number,
  data: {
    school_id?: number | null;
    phone?: string | null;
    personal_email?: string | null;
    address?: string | null;
    program_id?: number | null;
    programs_id?: number[];
    academic_line?: string | null;
    is_active?: boolean;
  }
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/teachers/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

// Vacancies (schema `vacancies.vacancy`)
export type CreateVacancyPayload = {
  areaId: number;
  /** Opcional; si hay `programId`, la API infiere la escuela desde el programa. */
  schoolId?: number | null;
  programId: number | null;
  positionName: string;
  curricularLine?: string | null;
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
  quantity: number;
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
    reqNumber: string;
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
  body?: { operationStatus?: "hired" | "closed" | "cancelled" }
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

// Coordinators
export async function getCoordinators(params?: {
  status?: string;
  campus?: string;
}): Promise<unknown[]> {
  const url = new URL(`${BASE_URL}/coordinators`);
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.campus) url.searchParams.set("campus", params.campus);
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getCoordinator(id: number): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/coordinators/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export type CreatePersonalPayload = {
  document: string;
  full_name: string;
  email?: string | null;
  phone?: string | null;
  role_id: number;
  program_id?: number | null;
};

export async function getPersonal(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/personal`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function createPersonal(
  payload: CreatePersonalPayload
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/personal`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleJson(response);
}

export async function getPersonalById(id: number): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/personal/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export type UpdatePersonalPayload = {
  full_name?: string;
  /** Solo si la persona aún no tiene cédula registrada. */
  document?: string;
  /** Correo personal (columna email); no modifica edu_email. */
  personal_email?: string | null;
  phone?: string | null;
  is_active?: boolean;
};

export async function updatePersonalProfile(
  id: number,
  data: UpdatePersonalPayload
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/personal/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function updateCoordinatorProfile(
  id: number,
  data: {
    school_id?: number | null;
    phone?: string | null;
    personal_email?: string | null;
    address?: string | null;
    is_active?: boolean;
  }
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/coordinators/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(data),
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
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function updateReinstatement(
  id: number,
  data: unknown
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/reinstatements/${id}`, {
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
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getLite(id: number): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/lites/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function updateLiteProfile(
  id: number,
  data: {
    school_id?: number | null;
    phone?: string | null;
    personal_email?: string | null;
    address?: string | null;
    programs_id?: number[];
    academic_line?: string | null;
    is_active?: boolean;
  }
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/lites/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export type CatalogArea = { id: number; name: string };
export type CatalogSchool = { id: number; name: string; area_id: number | null };
export type CatalogProgram = { id: number; name: string; school_id: number | null };
export type CatalogRole = { id: number; name: string };

export async function getCatalogAreas(): Promise<CatalogArea[]> {
  const response = await authFetch(`${BASE_URL}/catalog/areas`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getCatalogSchools(params?: {
  area_id?: number;
}): Promise<CatalogSchool[]> {
  const url = new URL(`${BASE_URL}/catalog/schools`);
  if (params?.area_id != null) {
    url.searchParams.set("area_id", String(params.area_id));
  }
  const response = await authFetch(url.toString(), {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getCatalogRoles(): Promise<CatalogRole[]> {
  const response = await authFetch(`${BASE_URL}/catalog/roles`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getCatalogPrograms(params?: {
  school_id?: number;
}): Promise<CatalogProgram[]> {
  const url = new URL(`${BASE_URL}/catalog/programs`);
  if (params?.school_id != null) url.searchParams.set("school_id", String(params.school_id));
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

/** Líneas académicas ya usadas en `person_program_assignments` (sugerencias). */
export async function getCatalogAcademicLines(): Promise<string[]> {
  const response = await authFetch(`${BASE_URL}/catalog/academic-lines`, {
    headers: jsonHeaders,
  });
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
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getAcademicLoadSummary(): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/academic-load/summary`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getTeacherAcademicLoad(document: string): Promise<unknown> {
  const enc = encodeURIComponent(document);
  const response = await authFetch(`${BASE_URL}/academic-load/teacher/${enc}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

// Dashboard
export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  const response = await authFetch(`${BASE_URL}/dashboard/summary`, {
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
  const base = `${IMPORT_BASE_URL}/import/docentes/stream/${encodeURIComponent(importId)}`;
  const token = getStoredJwt();
  const url =
    token != null && token.length > 0
      ? `${base}?access_token=${encodeURIComponent(token)}`
      : base;

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
  assertImportUsesBackendHost(IMPORT_BASE_URL);

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

  if (response.status === 401) {
    clearOrbitSession();
    throw new Error("Sesión expirada. Vuelve a iniciar sesión.");
  }

  if (response.status === 413) {
    throw new Error(
      "413: cuerpo de la petición rechazado. Si el Excel pesa menos de ~30 MB, lo más habitual es que la subida esté yendo al host del frontend (nginx suele limitar a ~1 MB), no a la API: revisa que VITE_API_URL en el build apunte a la URL completa del backend (p. ej. …run.app/api). Si el archivo es muy grande (>~32 MB en Cloud Run), reduce el archivo o usa subida a almacenamiento (p. ej. Cloud Storage)."
    );
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

export type WorkforceEventStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "TAKEN"
  | "NOT_TAKEN"
  | "CANCELLED";

export type WorkforceEventType = {
  id: number;
  name: string;
  description: string | null;
};

export type WorkforceEventPersonRef = {
  id: number;
  name: string;
  document: string | null;
  school_id: number | null;
  school_name: string | null;
  area_name: string | null;
};

export type WorkforceEvent = {
  id: string;
  event_type_id: number;
  event_type_name: string;
  observation: string | null;
  status: WorkforceEventStatus;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
  person: WorkforceEventPersonRef;
  created_by_person: { id: number; name: string };
};

export async function getWorkforceEventTypes(): Promise<WorkforceEventType[]> {
  const res = await authFetch(`${BASE_URL}/workforce-events/event-types`, {
    headers: jsonHeaders,
  });
  const json = (await handleJson(res)) as { data?: WorkforceEventType[] };
  return json.data ?? [];
}

export async function getWorkforceEvents(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkforceEventStatus;
  event_type_id?: number;
  person_id?: number;
  school_id?: number;
  area_id?: number;
}): Promise<PaginatedResponse<WorkforceEvent>> {
  const q = new URLSearchParams();
  if (params?.page != null) q.set("page", String(params.page));
  if (params?.limit != null) q.set("limit", String(params.limit));
  if (params?.search?.trim()) q.set("search", params.search.trim());
  if (params?.status) q.set("status", params.status);
  if (params?.event_type_id != null)
    q.set("event_type_id", String(params.event_type_id));
  if (params?.person_id != null)
    q.set("person_id", String(params.person_id));
  if (params?.school_id != null) q.set("school_id", String(params.school_id));
  if (params?.area_id != null) q.set("area_id", String(params.area_id));
  const qs = q.toString();
  const res = await authFetch(
    `${BASE_URL}/workforce-events/events${qs ? `?${qs}` : ""}`,
    { headers: jsonHeaders }
  );
  return handleJson(res) as Promise<PaginatedResponse<WorkforceEvent>>;
}

export async function getWorkforceEvent(id: string): Promise<WorkforceEvent> {
  const res = await authFetch(
    `${BASE_URL}/workforce-events/events/${encodeURIComponent(id)}`,
    { headers: jsonHeaders }
  );
  return handleJson(res) as Promise<WorkforceEvent>;
}

export async function createWorkforceEvent(body: {
  event_type_id: number;
  person_id: number;
  observation?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: WorkforceEventStatus;
}): Promise<WorkforceEvent> {
  const res = await authFetch(`${BASE_URL}/workforce-events/events`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  return handleJson(res) as Promise<WorkforceEvent>;
}

export type WorkforceEventStatusLog = {
  id: number;
  event_id: string;
  previous_status: WorkforceEventStatus | null;
  new_status: WorkforceEventStatus;
  changed_at: string;
  changed_by_person: { id: number; name: string };
};

export async function getWorkforceEventStatusLog(
  eventId: string
): Promise<WorkforceEventStatusLog[]> {
  const res = await authFetch(
    `${BASE_URL}/workforce-events/events/${encodeURIComponent(eventId)}/status-log`,
    { headers: jsonHeaders }
  );
  const json = (await handleJson(res)) as { data?: WorkforceEventStatusLog[] };
  return json.data ?? [];
}

/** Actualiza únicamente el estado; el backend registra el historial. */
export async function patchWorkforceEventStatus(
  id: string,
  status: WorkforceEventStatus
): Promise<WorkforceEvent> {
  const res = await authFetch(
    `${BASE_URL}/workforce-events/events/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ status }),
    }
  );
  return handleJson(res) as Promise<WorkforceEvent>;
}

/** @deprecated Usar patchWorkforceEventStatus */
export async function patchWorkforceEvent(
  id: string,
  body: { status: WorkforceEventStatus }
): Promise<WorkforceEvent> {
  return patchWorkforceEventStatus(id, body.status);
}
