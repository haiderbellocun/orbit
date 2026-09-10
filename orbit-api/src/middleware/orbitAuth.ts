import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import {
  ensureVacancyAdminCapabilities,
  hasCapability,
  isEmailAuthorizedForOrbit,
  isEmailOnOrbitAllowlist,
  isEmailVacancyAdmin,
  isAcademicCoordinatorRole,
  isEmailExplicitlyDeniedForOrbit,
  isOrbitLiteRole,
  ORBIT_CAPABILITY,
  resolvePlantaActivaGrantAccess,
  SUPER_ADMIN_CAPABILITIES,
  VACANCIES_ADMIN_CAPABILITIES,
  type OrbitAccess,
  type OrbitCapability,
} from "../lib/orbitCapabilities";
import { getPlantaActivaGrant } from "../lib/plantaActivaAccess";
import { isOrbitSessionActive } from "../lib/sessionPolicy";
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
  areaId: number | null;
  programIds: number[];
  /** `null` = sin recorte de vista (admin o ver todas). */
  plantaViewAreaIds: number[] | null;
  /** `null` = puede editar cualquier área (admin). */
  plantaEditAreaIds: number[] | null;
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

    if (!isOrbitSessionActive(decoded)) {
      res.status(401).json({ error: "La sesión expiró. Inicia sesión nuevamente" });
      return;
    }

    if (
      decoded.orbitAccess !== "lite" &&
      decoded.orbitAccess !== "full" &&
      decoded.orbitAccess !== "school"
    ) {
      res.status(401).json({ error: "Token inválido o expirado" });
      return;
    }

    const email = String(decoded.email ?? "").trim().toLowerCase();
    const academicCoordinator = isAcademicCoordinatorRole({
      roleCode: decoded.role != null ? String(decoded.role) : null,
      roleName: decoded.role != null ? String(decoded.role) : null,
    });
    const liteRole = isOrbitLiteRole({
      roleId:
        decoded.roleId == null ? null : asNum(decoded.roleId, 0) || null,
      roleCode: decoded.role != null ? String(decoded.role) : null,
      roleName: decoded.role != null ? String(decoded.role) : null,
    });
    if (
      isEmailExplicitlyDeniedForOrbit(email) ||
      (!isEmailAuthorizedForOrbit(email) && !academicCoordinator && !liteRole)
    ) {
      res.status(401).json({
        error:
          "ORBIT está en reestructuración. Tu cuenta aún no tiene acceso autorizado.",
      });
      return;
    }

    let orbitAccess: OrbitAccess = "full";
    let capabilities: OrbitCapability[];
    let plantaViewAreaIds: number[] | null = null;
    let plantaEditAreaIds: number[] | null = null;
    let coordinationSchoolId: number | null = null;

    if (isEmailOnOrbitAllowlist(email)) {
      // Allowlist admin = acceso total (ignora capabilities antiguas del JWT).
      capabilities = [...SUPER_ADMIN_CAPABILITIES];
    } else {
      const grant = getPlantaActivaGrant(email);
      if (grant) {
        capabilities = resolvePlantaActivaGrantAccess(grant).capabilities;
        const decodedAreaId = asNum((decoded as { areaId?: unknown }).areaId, 0);
        plantaViewAreaIds =
          grant.hierarchyScoped === true && grant.viewAreaIds?.length === 0 && decodedAreaId > 0
            ? [decodedAreaId]
            : grant.viewAreaIds;
        plantaEditAreaIds =
          grant.hierarchyScoped === true && grant.editAreaIds?.length === 0 && decodedAreaId > 0
            ? [decodedAreaId]
            : grant.editAreaIds == null ? null : [...grant.editAreaIds];
        if (grant.hierarchyScoped === true) {
          const decodedSchoolId = asNum(decoded.schoolId, 0);
          coordinationSchoolId = decodedSchoolId > 0 ? decodedSchoolId : null;
        }
      } else if (academicCoordinator) {
        capabilities = [
          ORBIT_CAPABILITY.PLANTA_ACTIVA,
          ORBIT_CAPABILITY.ACADEMIC_LOAD,
          ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
        ];
        const decodedAreaId = asNum((decoded as { areaId?: unknown }).areaId, 0);
        plantaViewAreaIds = decodedAreaId > 0 ? [decodedAreaId] : [];
        plantaEditAreaIds = decodedAreaId > 0 ? [decodedAreaId] : [];
        const decodedSchoolId = asNum(decoded.schoolId, 0);
        coordinationSchoolId = decodedSchoolId > 0 ? decodedSchoolId : null;
      } else if (liteRole) {
        orbitAccess = "lite";
        capabilities = [
          ORBIT_CAPABILITY.PLANTA_ACTIVA,
          ORBIT_CAPABILITY.ACADEMIC_LOAD,
          ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
        ];
        const decodedAreaId = asNum((decoded as { areaId?: unknown }).areaId, 0);
        plantaViewAreaIds = decodedAreaId > 0 ? [decodedAreaId] : [];
        plantaEditAreaIds = [];
        const decodedSchoolId = asNum(decoded.schoolId, 0);
        coordinationSchoolId = decodedSchoolId > 0 ? decodedSchoolId : null;
      } else if (isEmailVacancyAdmin(email)) {
        capabilities = [...VACANCIES_ADMIN_CAPABILITIES];
      } else {
        res.status(401).json({
          error:
            "ORBIT está en reestructuración. Tu cuenta aún no tiene acceso autorizado.",
        });
        return;
      }
    }

    capabilities = ensureVacancyAdminCapabilities(capabilities, email);

    const roleIdRaw = decoded.roleId;
    const roleId =
      roleIdRaw != null && roleIdRaw !== ""
        ? asNum(roleIdRaw, NaN)
        : null;

    req.orbitUser = {
      userId: asNum(decoded.userId, 0),
      personId: asNum(decoded.personId, 0),
      email,
      name: String(decoded.name ?? ""),
      picture:
        decoded.picture != null ? String(decoded.picture) : undefined,
      sub: String(decoded.sub ?? ""),
      role: decoded.role != null ? String(decoded.role) : null,
      roleId: Number.isFinite(roleId) ? roleId : null,
      orbitAccess,
      capabilities,
      // Acceso total / planta grant: sin recorte por escuela ni programa.
      schoolId: coordinationSchoolId,
      areaId: (() => {
        const aid =
          typeof decoded.areaId === "number"
            ? decoded.areaId
            : Number.parseInt(String(decoded.areaId ?? ""), 10);
        return Number.isFinite(aid) && aid > 0 ? aid : null;
      })(),
      programIds: orbitAccess === "lite" && Array.isArray(decoded.programIds)
        ? decoded.programIds.map((id) => asNum(id, 0)).filter((id) => id > 0)
        : [],
      plantaViewAreaIds,
      plantaEditAreaIds,
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

/** Áreas obligatorias para grants acotados; `null` significa acceso global. */
export function orbitAreaScopeFromRequest(req: Request): number[] | null {
  const u = req.orbitUser;
  if (u == null || u.plantaEditAreaIds == null || u.plantaViewAreaIds == null) {
    return null;
  }
  return [...new Set(u.plantaViewAreaIds.filter((id) => Number.isFinite(id) && id > 0))];
}

/** Escuela/coordinación específica de un grant jerárquico. */
export function orbitCoordinationSchoolIdFromRequest(req: Request): number | null {
  const u = req.orbitUser;
  if (
    u == null ||
    u.plantaEditAreaIds == null ||
    u.schoolId == null ||
    !Number.isFinite(u.schoolId) ||
    u.schoolId <= 0
  ) {
    return null;
  }
  return u.schoolId;
}

/** Alcance docentes para usuario LITE (misma escuela + intersección de programas). */
export function liteTeacherScopeFromRequest(
  req: Request
): { schoolId: number; programIds: number[] } | null {
  const u = req.orbitUser;
  if (!u || u.orbitAccess !== "lite") return null;
  // Para LITE nunca convertir una asignación incompleta en acceso amplio. Un
  // array vacío produce cero filas hasta que el usuario renueve su sesión.
  return {
    schoolId: u.schoolId != null && Number.isFinite(u.schoolId) ? u.schoolId : 0,
    programIds: u.programIds,
  };
}

/**
 * Valida capability según el path de la petición (evita que middleware apilados en `/api`
 * exijan HOME en rutas de vacantes, catálogo, etc.).
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

  // Selector de personas en Novedades (GET /personal).
  if (path.startsWith("/personal")) {
    if (
      !hasCapability(u.capabilities, ORBIT_CAPABILITY.NEWS) &&
      !hasCapability(u.capabilities, ORBIT_CAPABILITY.HOME)
    ) {
      res.status(403).json({ error: "No tienes permiso para este recurso" });
      return;
    }
    next();
    return;
  }

  let required: OrbitCapability | null = null;
  if (path.startsWith("/dashboard")) required = ORBIT_CAPABILITY.HOME;
  else if (path.startsWith("/planta-activa"))
    required = ORBIT_CAPABILITY.PLANTA_ACTIVA;
  else if (path.startsWith("/vacancies")) required = ORBIT_CAPABILITY.VACANCIES;
  else if (path.startsWith("/reinstatements")) required = ORBIT_CAPABILITY.VACANCIES;
  else if (path.startsWith("/academic-load")) required = ORBIT_CAPABILITY.ACADEMIC_LOAD;
  else if (path.startsWith("/substantive-hours"))
    required = ORBIT_CAPABILITY.SUBSTANTIVE_HOURS;
  else if (path.startsWith("/workforce-events")) required = ORBIT_CAPABILITY.NEWS;

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
