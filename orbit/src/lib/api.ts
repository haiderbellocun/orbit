import type {
  Vacancy,
  VacancyDetail,
  VacancyOperationNoteEntry,
  VacancyOperationStatus,
  OrbitNotification,
} from "@/src/types";
import { getPlantaActivaGrantByEmail } from "@/src/lib/plantaActivaAccess";

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
/**
 * El import por multipart no puede ir al mismo host que el SPA si ese host es solo nginx estÃ¡tico
 * (p. ej. Cloud Run `orbit-frontend`): devuelve 413. Mismo host con reverse proxy a Express: `VITE_ALLOW_SAME_ORIGIN_API=true`.
 */
export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PaginatedResponse<T = unknown> = {
  data: T[];
  pagination: PaginationMeta;
  org?: unknown;
};

/** Listados / lecturas habituales */
const DEFAULT_FETCH_TIMEOUT_MS = 120_000;
/** Solo subida del archivo al POST /import/docentes?async=1; el progreso sigue por SSE */

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

/** SesiÃ³n local vÃ¡lida (JWT con orbitAccess, capabilities y no expirado en ~30s). */
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
  const token = getStoredJwt();
  const p = token ? parseJwtPayload(token) : null;
  const base =
    fromUser && fromUser.length > 0
      ? fromUser
      : p?.capabilities && p.capabilities.length > 0
        ? p.capabilities
        : [];

  // Reborn: allowlist admin ve todas las capabilities aunque el JWT sea anterior.
  if (isStoredEmailOnOrbitAllowlist()) {
    return [...new Set([...ORBIT_ALLOWLIST_ADMIN_CAPABILITIES, ...base])];
  }
  // Admin de vacantes (eliminar / estado forzado).
  if (isStoredEmailVacancyAdmin()) {
    return [
      ...new Set([
        ...base,
        "view:vacancies",
        "vacancies:admin",
      ]),
    ];
  }
  return base;
}

/** Email de sesiÃ³n (orbit_user o JWT). */
export function getStoredUserEmail(): string | null {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(ORBIT_USER_STORAGE_KEY);
      if (raw) {
        const u = JSON.parse(raw) as { email?: unknown };
        if (typeof u.email === "string" && u.email.trim()) {
          return u.email.trim().toLowerCase();
        }
      }
    } catch {
      /* ignore */
    }
  }
  const token = getStoredJwt();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad)) as { email?: unknown };
    if (typeof payload.email === "string" && payload.email.trim()) {
      return payload.email.trim().toLowerCase();
    }
  } catch {
    /* ignore */
  }
  return null;
}

const DEFAULT_ORBIT_ACCESS_ALLOWLIST = [
  "camilo_quintero@cun.edu.co",
  "haider_bello@cun.edu.co",
  "raul_valencia@cun.edu.co",
  "zuany_acuna@cun.edu.co",
] as const;

const DEFAULT_VACANCY_ADMIN_ALLOWLIST = [
  "camilo_quintero@cun.edu.co",
  "yesid_rocha@cun.edu.co",
  "sara_murillofo@cun.edu.co",
  "cindy_russi@cun.edu.co",
] as const;

/** Misma allowlist de reborn que el API. Override: VITE_ORBIT_ACCESS_ALLOWLIST */
function getOrbitAccessAllowlist(): string[] {
  const raw = (
    (import.meta.env.VITE_ORBIT_ACCESS_ALLOWLIST as string | undefined) ?? ""
  ).trim();
  if (!raw) return [...DEFAULT_ORBIT_ACCESS_ALLOWLIST];
  const emails = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return emails.length > 0
    ? [...new Set(emails)]
    : [...DEFAULT_ORBIT_ACCESS_ALLOWLIST];
}

function isStoredEmailOnOrbitAllowlist(): boolean {
  const email = getStoredUserEmail();
  if (!email) return false;
  return getOrbitAccessAllowlist().includes(email);
}

function getVacancyAdminAllowlist(): string[] {
  const raw = (
    (import.meta.env.VITE_ORBIT_VACANCY_ADMIN_ALLOWLIST as string | undefined) ??
    ""
  ).trim();
  if (!raw) return [...DEFAULT_VACANCY_ADMIN_ALLOWLIST];
  const emails = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
  return emails.length > 0
    ? [...new Set(emails)]
    : [...DEFAULT_VACANCY_ADMIN_ALLOWLIST];
}

function isStoredEmailVacancyAdmin(): boolean {
  const email = getStoredUserEmail();
  if (!email) return false;
  return getVacancyAdminAllowlist().includes(email);
}

/** Capabilities de bootstrap admin (alineadas con SUPER_ADMIN del API). */
const ORBIT_ALLOWLIST_ADMIN_CAPABILITIES: readonly string[] = [
  "view:home",
  "view:academic_load",
  "view:substantive_hours",
  "view:vacancies",
  "vacancies:informative_panel",
  "vacancies:admin",
  "view:planta_activa",
  "view:news",
];

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

/** Alcance de Planta Activa (grants). `null` editAreaIds = admin sin lÃ­mite. */
export function getStoredPlantaActivaAccess(): {
  viewAreaIds: number[] | null;
  editAreaIds: number[] | null;
} | null {
  if (typeof localStorage !== "undefined") {
    try {
      const raw = localStorage.getItem(ORBIT_USER_STORAGE_KEY);
      if (raw) {
        const u = JSON.parse(raw) as {
          email?: string;
          plantaActivaAccess?: {
            viewAreaIds?: number[] | null;
            editAreaIds?: number[] | null;
          };
        };
        if (u.plantaActivaAccess) {
          return {
            viewAreaIds: u.plantaActivaAccess.viewAreaIds ?? null,
            editAreaIds: u.plantaActivaAccess.editAreaIds ?? null,
          };
        }
        // Fallback por email (misma tabla que el API) si el JWT es anterior.
        const grant = getPlantaActivaGrantByEmail(
          typeof u.email === "string" ? u.email : getStoredUserEmail()
        );
        if (grant) return grant;
      }
    } catch {
      /* ignore */
    }
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
    return `La solicitud superÃ³ el tiempo de espera (${sec}s). Comprueba que la API responda y que la base de datos sea alcanzable desde Cloud Run (p. ej. conector Cloud SQL en DB_HOST).`;
  }
  const min = Math.round(timeoutMs / 60_000);
  return `La solicitud superÃ³ el tiempo de espera (${min} min). Comprueba que la API responda y la base de datos no estÃ© bloqueada.`;
}

export type DashboardTrendType = "up" | "down" | "flat";

export type DashboardTrendUnit = "percent" | "absolute" | "none";

export type DashboardSummaryMetric = {
  value: number;
  trend: number;
  trendType: DashboardTrendType;
  trendUnit: DashboardTrendUnit;
  /** La direcciÃ³n de la tendencia es favorable (define el color en UI). */
  trendGood: boolean;
  detail: string;
};

export type DashboardSummaryResponse = {
  activeTeachers: DashboardSummaryMetric & {
    capacityPercentage: number | null;
  };
  openVacancies: DashboardSummaryMetric & {
    averageDaysToClose: number | null;
    positionsOpen: number;
  };
  monthlyHires: DashboardSummaryMetric & {
    positionsFilled: number;
  };
  timeToHire: DashboardSummaryMetric & {
    sampleSize: number;
  };
  agingVacancies: DashboardSummaryMetric & {
    oldestDays: number | null;
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
    plantaActivaAccess?: {
      viewAreaIds: number[] | null;
      editAreaIds: number[] | null;
    };
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
  /** Primer comentario de operaciÃ³n (opcional). */
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
  const qs = new URLSearchParams();
  if (params?.search?.trim()) qs.set("search", params.search.trim());
  if (params?.status?.trim()) qs.set("status", params.status.trim());
  if (params?.areaId?.trim()) qs.set("areaId", params.areaId.trim());
  if (params?.schoolId?.trim()) qs.set("schoolId", params.schoolId.trim());
  if (params?.programId?.trim()) qs.set("programId", params.programId.trim());
  if (params?.dateField) qs.set("dateField", params.dateField);
  if (params?.dateFrom?.trim()) qs.set("dateFrom", params.dateFrom.trim());
  if (params?.dateTo?.trim()) qs.set("dateTo", params.dateTo.trim());
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const response = await authFetch(`${BASE_URL}/vacancies/export.xlsx${suffix}`);
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
  const url = new URL(`${BASE_URL}/vacancies/audit-log`);
  if (params?.q) url.searchParams.set("q", params.q);
  if (params?.from) url.searchParams.set("from", params.from);
  if (params?.to) url.searchParams.set("to", params.to);
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getNotifications(params?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<OrbitNotification[]> {
  const url = new URL(`${BASE_URL}/notifications`);
  if (params?.unreadOnly) url.searchParams.set("unreadOnly", "1");
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const response = await authFetch(`${BASE_URL}/notifications/unread-count`, {
    headers: jsonHeaders,
  });
  const data = (await handleJson(response)) as { count?: number };
  return Number(data.count ?? 0);
}

export async function markNotificationRead(id: string): Promise<void> {
  const response = await authFetch(
    `${BASE_URL}/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH", headers: jsonHeaders }
  );
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `Error ${response.status}`
    );
  }
}

export async function markAllNotificationsRead(): Promise<void> {
  const response = await authFetch(`${BASE_URL}/notifications/read-all`, {
    method: "PATCH",
    headers: jsonHeaders,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      (err as { error?: string }).error ?? `Error ${response.status}`
    );
  }
}

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

export type PlantaActivaFilters = {
  search?: string;
  area_id?: number;
  school_id?: number;
  program_id?: number;
  role_id?: number;
  without_school?: boolean;
  without_program?: boolean;
  without_role?: boolean;
  without_edu_email?: boolean;
  without_document?: boolean;
  /** `active` (default) | `inactive` */
  status?: "active" | "inactive";
  page?: number;
  limit?: number;
  include_org?: boolean;
};

export type UpdatePlantaPersonPayload = {
  full_name?: string;
  document?: string;
  email?: string | null;
  edu_email?: string | null;
  phone?: string | null;
  address?: string | null;
  area_id?: number | null;
  school_id?: number | null;
  program_id?: number | null;
  role_id?: number | null;
  is_active?: boolean;
  /** Al inactivar: crear vacante (default true). Ignorado si el rol no aplica. */
  create_vacancy?: boolean;
};

export type CreatePlantaPersonPayload = {
  full_name: string;
  document: string;
  type_document?: string | null;
  email?: string | null;
  edu_email?: string | null;
  phone?: string | null;
  address?: string | null;
  area_id?: number | null;
  school_id?: number | null;
  program_id?: number | null;
  role_id?: number | null;
  is_active?: boolean;
};

export async function getPlantaActiva(
  params?: PlantaActivaFilters
): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/planta-activa`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.area_id != null)
    url.searchParams.set("area_id", String(params.area_id));
  if (params?.school_id != null)
    url.searchParams.set("school_id", String(params.school_id));
  if (params?.program_id != null)
    url.searchParams.set("program_id", String(params.program_id));
  if (params?.role_id != null)
    url.searchParams.set("role_id", String(params.role_id));
  if (params?.without_school) url.searchParams.set("without_school", "1");
  if (params?.without_program) url.searchParams.set("without_program", "1");
  if (params?.without_role) url.searchParams.set("without_role", "1");
  if (params?.without_edu_email)
    url.searchParams.set("without_edu_email", "1");
  if (params?.without_document)
    url.searchParams.set("without_document", "1");
  if (params?.status) url.searchParams.set("status", params.status);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  if (params?.include_org) url.searchParams.set("include_org", "1");
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getPlantaPerson(id: number): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/planta-activa/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function createPlantaPerson(
  data: CreatePlantaPersonPayload
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/planta-activa`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function updatePlantaPerson(
  id: number,
  data: UpdatePlantaPersonPayload
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/planta-activa/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function updatePlantaOrgParent(
  id: number,
  parentPersonId: number | null,
  opts?: { followOrganigrama?: boolean }
): Promise<unknown> {
  const response = await authFetch(
    `${BASE_URL}/planta-activa/${id}/org-parent`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(
        opts?.followOrganigrama
          ? { follow_organigrama: true }
          : { parent_person_id: parentPersonId }
      ),
    }
  );
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
  area_id?: number;
}): Promise<CatalogProgram[]> {
  const url = new URL(`${BASE_URL}/catalog/programs`);
  if (params?.school_id != null)
    url.searchParams.set("school_id", String(params.school_id));
  if (params?.area_id != null)
    url.searchParams.set("area_id", String(params.area_id));
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

/** LÃ­neas acadÃ©micas ya usadas en `person_program_assignments` (sugerencias). */
export async function getCatalogAcademicLines(): Promise<string[]> {
  const response = await authFetch(`${BASE_URL}/catalog/academic-lines`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

// Carga académica
export type AcademicLoadFilterOptions = {
  periods: string[];
  blocks: string[];
  programs: string[];
  modalities: { value: string; label: string }[];
  studyLevels: { value: string; label: string }[];
};

export async function getAcademicLoadFilterOptions(): Promise<AcademicLoadFilterOptions> {
  const response = await authFetch(`${BASE_URL}/academic-load/filter-options`, {
    headers: jsonHeaders,
  });
  const json = (await handleJson(response)) as Partial<AcademicLoadFilterOptions>;
  return {
    periods: Array.isArray(json.periods) ? json.periods.map(String) : [],
    blocks: Array.isArray(json.blocks) ? json.blocks.map(String) : [],
    programs: Array.isArray(json.programs) ? json.programs.map(String) : [],
    modalities: Array.isArray(json.modalities)
      ? json.modalities.map((m) => ({
          value: String((m as { value: string }).value),
          label: String((m as { label: string }).label),
        }))
      : [
          { value: "P", label: "Presencial" },
          { value: "V", label: "Virtual" },
        ],
    studyLevels: Array.isArray(json.studyLevels)
      ? json.studyLevels.map((m) => ({
          value: String((m as { value: string }).value),
          label: String((m as { label: string }).label),
        }))
      : [
          { value: "pregrado", label: "Pregrado" },
          { value: "especializacion", label: "Especialización" },
        ],
  };
}

export async function getAcademicLoad(params?: {
  teacher_document?: string;
  person_id?: number;
  period?: string;
  unit_name?: string;
  search?: string;
  modality?: string;
  type?: string;
  area_id?: number;
  school_id?: number;
  program?: string;
  subject?: string;
  group_code?: string;
  block?: string;
  study_level?: "pregrado" | "especializacion" | "otro" | string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const url = new URL(`${BASE_URL}/academic-load`);
  if (params?.teacher_document) {
    url.searchParams.set("teacher_document", params.teacher_document);
  }
  if (params?.person_id != null)
    url.searchParams.set("person_id", String(params.person_id));
  if (params?.period) url.searchParams.set("period", params.period);
  if (params?.unit_name) url.searchParams.set("unit_name", params.unit_name);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.modality) url.searchParams.set("modality", params.modality);
  if (params?.type) url.searchParams.set("type", params.type);
  if (params?.area_id != null)
    url.searchParams.set("area_id", String(params.area_id));
  if (params?.school_id != null)
    url.searchParams.set("school_id", String(params.school_id));
  if (params?.program) url.searchParams.set("program", params.program);
  if (params?.subject) url.searchParams.set("subject", params.subject);
  if (params?.group_code) url.searchParams.set("group_code", params.group_code);
  if (params?.block) url.searchParams.set("block", params.block);
  if (params?.study_level) url.searchParams.set("study_level", params.study_level);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export type AcademicLoadTeacherSummary = {
  personId: number;
  document: string;
  name: string;
  area: string;
  school: string;
  contractType: string;
  workSchedule: string;
  contractHoursWeekly: number | null;
  assignmentCount: number;
  teachingModality: "presencial" | "virtual" | "mixto" | null;
  creditsPresencial: number;
  studentsVirtual: number;
  creditTarget: number | null;
  studentTarget: number | null;
  loadIndex: number | null;
  fulfillmentPct: number | null;
  quotaStatus: "under" | "ok" | "over" | "unknown";
  creditsGap: number | null;
  studentsGap: number | null;
};

export async function getAcademicLoadTeacherSummaries(params?: {
  search?: string;
  period?: string;
  modality?: string;
  area_id?: number;
  school_id?: number;
  program?: string;
  subject?: string;
  group_code?: string;
  block?: string;
  study_level?: "pregrado" | "especializacion" | "otro" | string;
  teaching_modality?: "presencial" | "virtual" | "mixto";
  quota_status?: "under" | "ok" | "over" | "unknown";
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<AcademicLoadTeacherSummary>> {
  const url = new URL(`${BASE_URL}/academic-load/teacher-summaries`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.period) url.searchParams.set("period", params.period);
  if (params?.modality) url.searchParams.set("modality", params.modality);
  if (params?.area_id != null)
    url.searchParams.set("area_id", String(params.area_id));
  if (params?.school_id != null)
    url.searchParams.set("school_id", String(params.school_id));
  if (params?.program) url.searchParams.set("program", params.program);
  if (params?.subject) url.searchParams.set("subject", params.subject);
  if (params?.group_code) url.searchParams.set("group_code", params.group_code);
  if (params?.block) url.searchParams.set("block", params.block);
  if (params?.study_level) url.searchParams.set("study_level", params.study_level);
  if (params?.teaching_modality)
    url.searchParams.set("teaching_modality", params.teaching_modality);
  if (params?.quota_status) url.searchParams.set("quota_status", params.quota_status);
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

export type SubstantiveHoursTeacher = {
  id: string;
  document: string;
  name: string;
  email: string;
  area: string;
  school: string;
  contractType: string;
  workSchedule: string;
  roleName: string;
  isLite: boolean;
  contractHoursWeekly: number | null;
  catedraHours: number;
  preparationHours: number;
  substantiveHoursAssigned: number;
  substantiveHoursRemaining: number | null;
  teachingModality: "presencial" | "virtual" | "mixto" | null;
  creditsPresencial: number;
  studentsVirtual: number;
  creditTarget: number | null;
  studentTarget: number | null;
  loadIndex: number | null;
  fulfillmentPct: number | null;
  quotaStatus: "under" | "ok" | "over" | "unknown";
  creditsGap: number | null;
  studentsGap: number | null;
};

export type SubstantiveHoursCategory = {
  id: number | null;
  name: string;
};

export type SubstantiveHoursAssignmentTask = {
  id: number;
  description: string;
  sortOrder: number;
};

export type SubstantiveHoursAssignment = {
  id: number;
  personId: number;
  categoryId: number | null;
  categoryName: string;
  hoursQuantity: number;
  createdAt: string;
  updatedAt: string;
  tasks: SubstantiveHoursAssignmentTask[];
};

export async function getSubstantiveHoursTeachers(params?: {
  search?: string;
  area_id?: number;
  school_id?: number;
  period?: string;
  contract_hours?: 21 | 42;
  availability?: "available" | "none" | "unknown";
  has_catedra?: boolean;
  has_substantive?: boolean;
  without_edu_email?: boolean;
  role?: "docente" | "docente_pensionado" | "lite";
  teaching_modality?: "presencial" | "virtual" | "mixto";
  quota_status?: "under" | "ok" | "over" | "unknown";
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<SubstantiveHoursTeacher>> {
  const url = new URL(`${BASE_URL}/substantive-hours/teachers`);
  if (params?.search) url.searchParams.set("search", params.search);
  if (params?.area_id != null)
    url.searchParams.set("area_id", String(params.area_id));
  if (params?.school_id != null)
    url.searchParams.set("school_id", String(params.school_id));
  if (params?.period) url.searchParams.set("period", params.period);
  if (params?.contract_hours != null)
    url.searchParams.set("contract_hours", String(params.contract_hours));
  if (params?.availability)
    url.searchParams.set("availability", params.availability);
  if (params?.has_catedra != null)
    url.searchParams.set("has_catedra", String(params.has_catedra));
  if (params?.has_substantive != null)
    url.searchParams.set("has_substantive", String(params.has_substantive));
  if (params?.without_edu_email)
    url.searchParams.set("without_edu_email", "1");
  if (params?.role) url.searchParams.set("role", params.role);
  if (params?.teaching_modality)
    url.searchParams.set("teaching_modality", params.teaching_modality);
  if (params?.quota_status) url.searchParams.set("quota_status", params.quota_status);
  if (params?.page != null) url.searchParams.set("page", String(params.page));
  if (params?.limit != null) url.searchParams.set("limit", String(params.limit));
  const response = await authFetch(url.toString(), { headers: jsonHeaders });
  return handleJson(response);
}

export async function getSubstantiveHoursCategories(): Promise<
  SubstantiveHoursCategory[]
> {
  const response = await authFetch(`${BASE_URL}/substantive-hours/categories`, {
    headers: jsonHeaders,
  });
  const json = (await handleJson(response)) as {
    data?: SubstantiveHoursCategory[];
  };
  return Array.isArray(json.data) ? json.data : [];
}

export async function getSubstantiveHoursAssignments(
  personId: number
): Promise<SubstantiveHoursAssignment[]> {
  const response = await authFetch(
    `${BASE_URL}/substantive-hours/teachers/${personId}/assignments`,
    { headers: jsonHeaders }
  );
  const json = (await handleJson(response)) as {
    data?: SubstantiveHoursAssignment[];
  };
  return Array.isArray(json.data) ? json.data : [];
}

export async function createSubstantiveHoursAssignment(body: {
  personId: number;
  categoryId?: number | null;
  hoursQuantity: number;
  tasks: string[];
}): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/substantive-hours/assignments`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  return handleJson(response);
}

export type ClassPreparationUpdateResult = {
  id: number;
  personId: number;
  preparationHours: number;
  contractHoursWeekly: number | null;
  catedraHours: number;
  substantiveHoursAssigned: number;
  substantiveHoursRemaining: number | null;
  updatedAt: string;
};

/** Upsert horas semanales de preparación de clase del docente. */
export async function updateClassPreparationHours(
  personId: number,
  hoursQuantity: number
): Promise<ClassPreparationUpdateResult> {
  const response = await authFetch(
    `${BASE_URL}/substantive-hours/teachers/${personId}/class-preparation`,
    {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ hoursQuantity }),
    }
  );
  const json = (await handleJson(response)) as {
    data: ClassPreparationUpdateResult;
  };
  return json.data;
}

// Dashboard
export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  const response = await authFetch(`${BASE_URL}/dashboard/summary`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
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

/** Actualiza Ãºnicamente el estado; el backend registra el historial. */
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
