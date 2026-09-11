import { getPlantaActivaGrantByEmail } from "@/src/lib/plantaActivaAccess";

export type OrbitAccess = "lite" | "full" | "school";

export const ORBIT_JWT_STORAGE_KEY = "orbit_jwt";
export const ORBIT_USER_STORAGE_KEY = "orbit_user";
const ORBIT_SESSION_TTL_MS = 2 * 60 * 60 * 1000;

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
function parseJwtPayload(token: string): {
  exp: number;
  iat: number;
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
      iat?: number;
      orbitAccess?: string;
      capabilities?: unknown;
    };
    if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
    const capabilities = Array.isArray(payload.capabilities)
      ? payload.capabilities.filter((c): c is string => typeof c === "string")
      : undefined;
    return {
      exp: payload.exp,
      iat: payload.iat,
      orbitAccess: payload.orbitAccess,
      capabilities,
    };
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
  const storedExpiry = getStoredUserSessionExpiresAt();
  if (storedExpiry != null) return storedExpiry > Date.now() + 30_000;
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
  const nowWithSafetyMargin = Date.now() + 30_000;
  const sessionMaxExpiry = p.iat * 1000 + ORBIT_SESSION_TTL_MS;
  return (
    p.exp * 1000 > nowWithSafetyMargin &&
    sessionMaxExpiry > nowWithSafetyMargin
  );
}

/** Instante efectivo de expiración, limitado a dos horas desde la emisión. */
export function getStoredSessionExpiresAt(): number | null {
  const storedExpiry = getStoredUserSessionExpiresAt();
  if (storedExpiry != null) return storedExpiry;
  const token = getStoredJwt();
  const payload = token ? parseJwtPayload(token) : null;
  if (!payload) return null;
  return Math.min(
    payload.exp * 1000,
    payload.iat * 1000 + ORBIT_SESSION_TTL_MS
  );
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
  if (isStoredEmailRoleManagementAdmin()) {
    return [...new Set([...base, "roles:manage"] )];
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

/** Email de sesión (orbit_user o JWT). */
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

const DEFAULT_ROLE_MANAGEMENT_ALLOWLIST = [
  "camilo_quintero@cun.edu.co",
  "haider_bello@cun.edu.co",
  "zuany_acuna@cun.edu.co",
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

function isStoredEmailRoleManagementAdmin(): boolean {
  const email = getStoredUserEmail();
  if (!email) return false;
  const raw = (import.meta.env.VITE_ORBIT_ROLE_MANAGEMENT_ALLOWLIST as string | undefined)?.trim();
  const allowlist = raw
    ? raw.split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [...DEFAULT_ROLE_MANAGEMENT_ALLOWLIST];
  return allowlist.includes(email);
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

/** Alcance de Planta Activa (grants). `null` editAreaIds = admin sin límite. */
export function getStoredPlantaActivaAccess(): {
  viewAreaIds: number[] | null;
  editAreaIds: number[] | null;
  hierarchyScoped?: boolean;
  coordinationSchoolId?: number | null;
  personalDataOnly?: boolean;
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
            hierarchyScoped?: boolean;
            coordinationSchoolId?: number | null;
            personalDataOnly?: boolean;
          };
        };
        const currentEmail =
          typeof u.email === "string" ? u.email : getStoredUserEmail();
        const currentGrant = getPlantaActivaGrantByEmail(currentEmail);
        if (currentGrant) {
          const coordinationSchoolId =
            u.plantaActivaAccess?.coordinationSchoolId ?? null;
          if (
            currentGrant.hierarchyScoped === true &&
            currentGrant.viewAreaIds.length === 0 &&
            u.plantaActivaAccess?.viewAreaIds?.length
          ) {
            return {
              ...currentGrant,
              viewAreaIds: u.plantaActivaAccess.viewAreaIds,
              editAreaIds: u.plantaActivaAccess.editAreaIds ?? [],
              coordinationSchoolId,
              personalDataOnly:
                u.plantaActivaAccess?.personalDataOnly === true,
            };
          }
          return {
            ...currentGrant,
            coordinationSchoolId,
            personalDataOnly:
              u.plantaActivaAccess?.personalDataOnly === true,
          };
        }
        if (u.plantaActivaAccess) {
          return {
            viewAreaIds: u.plantaActivaAccess.viewAreaIds ?? null,
            editAreaIds: u.plantaActivaAccess.editAreaIds ?? null,
            hierarchyScoped: u.plantaActivaAccess.hierarchyScoped === true,
            coordinationSchoolId:
              u.plantaActivaAccess.coordinationSchoolId ?? null,
            personalDataOnly: u.plantaActivaAccess.personalDataOnly === true,
          };
        }
        // Fallback por email (misma tabla que el API) si el JWT es anterior.
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}
function getStoredUserSessionExpiresAt(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(ORBIT_USER_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as { sessionExpiresAt?: unknown };
    return typeof value.sessionExpiresAt === "number" && Number.isFinite(value.sessionExpiresAt)
      ? value.sessionExpiresAt
      : null;
  } catch {
    return null;
  }
}
export type AuthUser = {
  id: number;
  personId: number | null;
  email: string;
  name: string;
  roleCode: string | null;
  roleName: string | null;
};

export type GoogleAuthResponse = {
  expiresAt: number;
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
      hierarchyScoped?: boolean;
      coordinationSchoolId?: number | null;
      personalDataOnly?: boolean;
    };
  };
};

export function persistOrbitSession(auth: GoogleAuthResponse): void {
  localStorage.removeItem(ORBIT_JWT_STORAGE_KEY);
  localStorage.setItem(
    ORBIT_USER_STORAGE_KEY,
    JSON.stringify({ ...auth.user, sessionExpiresAt: auth.expiresAt })
  );
}
