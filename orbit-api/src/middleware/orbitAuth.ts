import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
  hasCapability,
  ORBIT_CAPABILITY,
  type OrbitAccess,
  type OrbitCapability,
} from "../lib/orbitCapabilities";
export {
  schoolScopeFromRequest,
  vacancyAllowedForSchoolScope,
  personAllowedForSchoolScope,
} from "../lib/schoolScope";

export type OrbitJwtUser = {
  userId: number;
  personId: number;
  email: string;
  name: string;
  picture?: string;
  sub: string;
  role: string | null;
  roleId: number | null;
  orbitAccess: OrbitAccess;
  capabilities: OrbitCapability[];
  schoolId: number | null;
  programIds: number[];
};

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      orbitUser?: OrbitJwtUser;
    }
  }
}

function asNum(v: unknown, fallback = 0): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseProgramIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const x of v) {
    const n = typeof x === "number" ? x : Number.parseInt(String(x), 10);
    if (Number.isFinite(n)) out.push(n);
  }
  return [...new Set(out)];
}

function parseCapabilities(v: unknown): OrbitCapability[] {
  if (!Array.isArray(v)) return [];
  const out: OrbitCapability[] = [];
  for (const x of v) {
    if (typeof x === "string" && x.trim() !== "") {
      out.push(x.trim() as OrbitCapability);
    }
  }
  return [...new Set(out)];
}

function extractBearerToken(req: Request): string | null {
  const auth = req.headers.authorization;
  const prefix = "Bearer ";
  if (auth?.startsWith(prefix)) {
    const t = auth.slice(prefix.length).trim();
    if (t) return t;
  }
  /** EventSource no puede enviar cabeceras; el cliente envía el JWT en query. */
  if (req.method === "GET") {
    const q = req.query.access_token;
    if (typeof q === "string" && q.trim() !== "") return q.trim();
  }
  return null;
}

export function orbitAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Se requiere autenticación" });
    return;
  }
  const secret = (process.env.JWT_SECRET ?? "").trim();
  if (!secret) {
    res.status(500).json({ error: "JWT no configurado" });
    return;
  }
  try {
    const decoded = jwt.verify(token, secret) as jwt.JwtPayload & {
      userId?: unknown;
      personId?: unknown;
      email?: unknown;
      name?: unknown;
      picture?: unknown;
      sub?: unknown;
      role?: unknown;
      roleId?: unknown;
      orbitAccess?: unknown;
      capabilities?: unknown;
      schoolId?: unknown;
      programIds?: unknown;
    };

    if (
      decoded.orbitAccess !== "lite" &&
      decoded.orbitAccess !== "full" &&
      decoded.orbitAccess !== "school"
    ) {
      res.status(401).json({ error: "Token inválido o expirado" });
      return;
    }
    const orbitAccess = decoded.orbitAccess;
    const capabilities = parseCapabilities(decoded.capabilities);
    if (capabilities.length === 0) {
      res.status(401).json({ error: "Token inválido o expirado" });
      return;
    }

    const schoolIdRaw = decoded.schoolId;
    const schoolId =
      schoolIdRaw != null && schoolIdRaw !== ""
        ? asNum(schoolIdRaw, NaN)
        : null;

    const roleIdRaw = decoded.roleId;
    const roleId =
      roleIdRaw != null && roleIdRaw !== ""
        ? asNum(roleIdRaw, NaN)
        : null;

    req.orbitUser = {
      userId: asNum(decoded.userId, 0),
      personId: asNum(decoded.personId, 0),
      email: String(decoded.email ?? ""),
      name: String(decoded.name ?? ""),
      picture:
        decoded.picture != null ? String(decoded.picture) : undefined,
      sub: String(decoded.sub ?? ""),
      role: decoded.role != null ? String(decoded.role) : null,
      roleId: Number.isFinite(roleId) ? roleId : null,
      orbitAccess,
      capabilities,
      schoolId:
        (orbitAccess === "lite" || orbitAccess === "school") && Number.isFinite(schoolId)
          ? schoolId
          : null,
      programIds: orbitAccess === "lite" ? parseProgramIds(decoded.programIds) : [],
    };
    next();
  } catch {
    res.status(401).json({ error: "Token inválido o expirado" });
  }
}

/** `person_id` del usuario autenticado, o null si no aplica. */
export function orbitPersonIdFromRequest(req: Request): number | null {
  const u = req.orbitUser;
  if (u == null || !Number.isFinite(u.personId) || u.personId <= 0) {
    return null;
  }
  return u.personId;
}

/** Alcance docentes para usuario LITE (misma escuela + intersección de programas). */
export function liteTeacherScopeFromRequest(
  req: Request
): { schoolId: number; programIds: number[] } | null {
  const u = req.orbitUser;
  if (!u || u.orbitAccess !== "lite") return null;
  if (u.schoolId == null || !Number.isFinite(u.schoolId) || u.programIds.length === 0) {
    return null;
  }
  return { schoolId: u.schoolId, programIds: u.programIds };
}

/**
 * Valida capability según el path de la petición (evita que middleware apilados en `/api`
 * exijan HOME/TEACHERS en rutas de vacantes, catálogo, etc.).
 */
export function orbitCapabilityByPathMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === "OPTIONS") {
    next();
    return;
  }

  const u = req.orbitUser;
  if (!u) {
    res.status(401).json({ error: "Se requiere autenticación" });
    return;
  }

  const path = req.path;

  if (path.startsWith("/catalog")) {
    next();
    return;
  }

  if (path.startsWith("/import")) {
    if (!hasCapability(u.capabilities, ORBIT_CAPABILITY.TEACHERS)) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }
    if (u.orbitAccess === "lite") {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }
    next();
    return;
  }

  let required: OrbitCapability | null = null;
  if (path.startsWith("/dashboard")) required = ORBIT_CAPABILITY.HOME;
  else if (path.startsWith("/teachers")) required = ORBIT_CAPABILITY.TEACHERS;
  else if (path.startsWith("/personal")) required = ORBIT_CAPABILITY.PERSONAL;
  else if (path.startsWith("/vacancies")) required = ORBIT_CAPABILITY.VACANCIES;
  else if (path.startsWith("/coordinators")) required = ORBIT_CAPABILITY.COORDINATORS;
  else if (path.startsWith("/reinstatements")) required = ORBIT_CAPABILITY.VACANCIES;
  else if (path.startsWith("/lites")) required = ORBIT_CAPABILITY.LITES;
  else if (path.startsWith("/academic-load")) required = ORBIT_CAPABILITY.ACADEMIC_LOAD;

  if (required == null) {
    next();
    return;
  }

  if (!hasCapability(u.capabilities, required)) {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return;
  }

  next();
}

export function requireCapability(capability: OrbitCapability) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.method === "OPTIONS") {
      next();
      return;
    }
    const u = req.orbitUser;
    if (!u) {
      res.status(401).json({ error: "Se requiere autenticación" });
      return;
    }
    if (!hasCapability(u.capabilities, capability)) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }
    next();
  };
}

/** Usuario con acceso completo (todas las capabilities operativas). */
export function requireFullOrbitAccess(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.method === "OPTIONS") {
    next();
    return;
  }
  const u = req.orbitUser;
  if (!u) {
    res.status(401).json({ error: "Se requiere autenticación" });
    return;
  }
  if (u.orbitAccess === "lite") {
    res.status(403).json({ error: "No tienes permiso para este recurso" });
    return;
  }
  next();
}
