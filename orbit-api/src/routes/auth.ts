import express, { Router, type Request, type Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../db/connection";
import {
  ensureVacancyAdminCapabilities,
  isEmailAuthorizedForOrbit,
  isEmailOnOrbitAllowlist,
  isEmailVacancyAdmin,
  isAcademicCoordinatorRole,
  isEmailExplicitlyDeniedForOrbit,
  isOrbitLiteRole,
  resolveAllowlistAdminAccess,
  resolvePlantaActivaGrantAccess,
  VACANCIES_ADMIN_CAPABILITIES,
  type OrbitAccess,
  type OrbitCapability,
} from "../lib/orbitCapabilities";
import { getPlantaActivaGrant } from "../lib/plantaActivaAccess";
import { recordAppLoginAsync } from "../lib/loginAppsLog";
import { ORBIT_JWT_EXPIRES_IN } from "../lib/sessionPolicy";
import { clearOrbitSessionCookie, setOrbitSessionCookie } from "../lib/sessionCookie";
import { orbitAuthMiddleware } from "../middleware/orbitAuth";

const router = Router();

/** GIS redirect POST puede ser JSON o form-urlencoded. */
const gisCallbackBodyParsers: express.RequestHandler[] = [
  express.json({ limit: "2mb" }),
  express.urlencoded({ extended: true, limit: "2mb" }),
];

function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.cookie;
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const p = part.trim();
    if (!p.startsWith(`${name}=`)) continue;
    return decodeURIComponent(p.slice(name.length + 1));
  }
  return undefined;
}

function verifyGisRedirectCsrf(req: Request, body: Record<string, unknown>): boolean {
  const cookieTok = readCookie(req, "g_csrf_token");
  const bodyTok =
    typeof body.g_csrf_token === "string" ? body.g_csrf_token.trim() : "";
  return Boolean(cookieTok && bodyTok && cookieTok === bodyTok);
}

function getOrbitFrontendBaseUrl(): string {
  const v = (process.env.ORBIT_FRONTEND_URL ?? "").trim().replace(/\/$/, "");
  if (v) return v;
  if ((process.env.NODE_ENV ?? "").trim().toLowerCase() === "development") {
    return "http://localhost:3000";
  }
  throw new Error("Missing ORBIT_FRONTEND_URL (required for Google redirect login in production)");
}

function sendGisCallbackHtml(res: Response, status: number, title: string, bodyHtml: string): void {
  res.status(status).type("html").send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title></head>
<body style="font-family:system-ui,sans-serif;padding:2rem;">${bodyHtml}</body></html>`);
}

function sendGisSuccessRedirect(res: Response, auth: AuthSuccessBody): void {
  const target = `${getOrbitFrontendBaseUrl().replace(/\/$/, "")}/`;
  setOrbitSessionCookie(res, auth.token);
  res.redirect(303, target);
}

function sendAuthSuccess(res: Response, auth: AuthSuccessBody): void {
  setOrbitSessionCookie(res, auth.token);
  res.json({ user: auth.user, expiresAt: Date.now() + 2 * 60 * 60 * 1000 });
}

type GoogleLoginBody = {
  idToken?: unknown;
};

type LocalEmailBody = {
  email?: unknown;
};

type PersonRow = {
  person_id: number;
  full_name: string;
  email: string | null;
  role_id: number | null;
  area_id: number | null;
  school_id: number | null;
  program_id: number | null;
  programs_id: number[] | null;
  role_code: string | null;
  role_name: string | null;
};

function getRequiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

/** Login por correo sin Google: solo desarrollo local o con flag explícito. */
export function isLocalEmailAuthEnabled(): boolean {
  const v = (process.env.ALLOW_LOCAL_EMAIL_AUTH ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "yes") return true;
  return (process.env.NODE_ENV ?? "").trim().toLowerCase() === "development";
}

async function fetchPersonByEmail(emailNorm: string): Promise<PersonRow | null> {
  const tableCheck = await pool.query(
    `SELECT to_regclass('person') AS person_table`
  );
  const personTable = tableCheck.rows[0]?.person_table as string | null | undefined;
  if (!personTable) return null;

  const ppaCheck = await pool.query(
    `SELECT to_regclass('person_program_assignments') AS ppa_table`
  );
  const ppaTable = ppaCheck.rows[0]?.ppa_table as string | null | undefined;
  const programsSelect = ppaTable
    ? `COALESCE(ppa.programs_id, ARRAY[]::INTEGER[]) AS programs_id`
    : `ARRAY[]::INTEGER[] AS programs_id`;
  const ppaJoin = ppaTable
    ? `LEFT JOIN person_program_assignments ppa ON ppa.person_id = p.id`
    : "";

  const activeCol = await pool.query(
    `SELECT EXISTS (
      SELECT 1
      FROM pg_attribute a
      WHERE a.attrelid = to_regclass('person')
        AND a.attname = 'is_active'
        AND a.attnum > 0
        AND NOT a.attisdropped
    ) AS has_is_active`
  );
  const hasPersonIsActive = Boolean(activeCol.rows[0]?.has_is_active);
  const activeSql = hasPersonIsActive ? `AND COALESCE(p.is_active, true) = true` : "";

  try {
    const personResult = await pool.query(
      `SELECT
         p.id AS person_id,
         p.full_name,
         COALESCE(NULLIF(TRIM(p.edu_email), ''), NULLIF(TRIM(p.email), '')) AS email,
         p.role_id,
         COALESCE(p.area_id, s.area_id) AS area_id,
         p.school_id,
         p.program_id,
         ${programsSelect},
         r.code AS role_code,
         r.name AS role_name
       FROM person p
       LEFT JOIN role r ON r.id = p.role_id
       LEFT JOIN school s ON s.id = p.school_id
       ${ppaJoin}
       WHERE (
           LOWER(TRIM(p.email)) = $1
           OR LOWER(TRIM(p.edu_email)) = $1
         )
         ${activeSql}
       LIMIT 1`,
      [emailNorm]
    );
    return (personResult.rows[0] ?? null) as PersonRow | null;
  } catch (e: unknown) {
    console.warn("fetchPersonByEmail failed:", e);
    return null;
  }
}

type OrbitGate =
  | {
      ok: true;
      orbitAccess: OrbitAccess;
      capabilities: OrbitCapability[];
      schoolId: number | null;
      areaId: number | null;
      programIds: number[];
      /** `null` = sin recorte (admin) o ver todas. */
      plantaViewAreaIds: number[] | null;
      /** `null` = puede editar cualquier área (admin). */
      plantaEditAreaIds: number[] | null;
    }
  | { ok: false; status: number; error: string };

async function gateOrbitRoleAndLite(
  person: PersonRow,
  loginEmail: string
): Promise<OrbitGate> {
  const emailNorm = loginEmail.trim().toLowerCase();
  const personEmailNorm = (person.email ?? "").trim().toLowerCase();
  const liteRole = isOrbitLiteRole({
    roleId: person.role_id == null ? null : Number(person.role_id),
    roleCode: person.role_code,
    roleName: person.role_name,
  });

  if (
    isEmailExplicitlyDeniedForOrbit(emailNorm) ||
    isEmailExplicitlyDeniedForOrbit(personEmailNorm)
  ) {
    return {
      ok: false,
      status: 403,
      error: "Tu cuenta no tiene acceso autorizado a ORBIT.",
    };
  }

  // Reborn: allowlist admin (acceso total) o grant acotado de Planta Activa.
  const authorized =
    isEmailAuthorizedForOrbit(emailNorm) ||
    isEmailAuthorizedForOrbit(personEmailNorm) ||
    isAcademicCoordinatorRole({
      roleCode: person.role_code,
      roleName: person.role_name,
    }) || liteRole;
  if (!authorized) {
    return {
      ok: false,
      status: 403,
      error:
        "ORBIT está en reestructuración. Tu cuenta aún no tiene acceso autorizado.",
    };
  }

  if (
    isEmailOnOrbitAllowlist(emailNorm) ||
    isEmailOnOrbitAllowlist(personEmailNorm)
  ) {
    const { orbitAccess, capabilities } = resolveAllowlistAdminAccess();
    return {
      ok: true,
      orbitAccess,
      capabilities: ensureVacancyAdminCapabilities(
        capabilities,
        emailNorm || personEmailNorm
      ),
      schoolId: null,
      areaId: null,
      programIds: [],
      plantaViewAreaIds: null,
      plantaEditAreaIds: null,
    };
  }

  const grant =
    getPlantaActivaGrant(emailNorm) ?? getPlantaActivaGrant(personEmailNorm);
  if (grant) {
    const { orbitAccess, capabilities } = resolvePlantaActivaGrantAccess(grant);
    const hierarchyAreaId =
      grant.hierarchyScoped === true && person.area_id != null
        ? Number(person.area_id)
        : null;
    return {
      ok: true,
      orbitAccess,
      capabilities: ensureVacancyAdminCapabilities(
        capabilities,
        emailNorm || personEmailNorm
      ),
      schoolId:
        grant.hierarchyScoped === true && person.school_id != null
          ? Number(person.school_id)
          : null,
      areaId: hierarchyAreaId,
      programIds: [],
      plantaViewAreaIds:
        hierarchyAreaId != null && grant.viewAreaIds?.length === 0
          ? [hierarchyAreaId]
          : grant.viewAreaIds ?? null,
      plantaEditAreaIds:
        hierarchyAreaId != null && grant.editAreaIds?.length === 0
          ? [hierarchyAreaId]
          : grant.editAreaIds,
    };
  }

  if (liteRole) {
    const programIds = [...new Set([
      ...(Array.isArray(person.programs_id) ? person.programs_id : []),
      ...(person.program_id == null ? [] : [Number(person.program_id)]),
    ].map(Number).filter((id) => Number.isFinite(id) && id > 0))];
    return {
      ok: true,
      orbitAccess: "lite",
      capabilities: [
        "view:planta_activa",
        "view:academic_load",
        "view:substantive_hours",
      ],
      schoolId: person.school_id == null ? null : Number(person.school_id),
      areaId: person.area_id == null ? null : Number(person.area_id),
      programIds,
      plantaViewAreaIds: person.area_id == null ? [] : [Number(person.area_id)],
      plantaEditAreaIds: [],
    };
  }


  if (
    isAcademicCoordinatorRole({
      roleCode: person.role_code,
      roleName: person.role_name,
    })
  ) {
    return {
      ok: true,
      orbitAccess: "full",
      capabilities: [
        "view:planta_activa",
        "view:academic_load",
        "view:substantive_hours",
      ],
      schoolId: person.school_id == null ? null : Number(person.school_id),
      areaId: person.area_id == null ? null : Number(person.area_id),
      programIds: [],
      plantaViewAreaIds:
        person.area_id == null ? [] : [Number(person.area_id)],
      plantaEditAreaIds:
        person.area_id == null ? [] : [Number(person.area_id)],
    };
  }

  // Solo admin de vacantes (p. ej. Yesid): acceso a vacantes + eliminar.
  if (isEmailVacancyAdmin(emailNorm) || isEmailVacancyAdmin(personEmailNorm)) {
    return {
      ok: true,
      orbitAccess: "full",
      capabilities: ensureVacancyAdminCapabilities(
        [...VACANCIES_ADMIN_CAPABILITIES],
        emailNorm || personEmailNorm
      ),
      schoolId: null,
      areaId: null,
      programIds: [],
      plantaViewAreaIds: null,
      plantaEditAreaIds: null,
    };
  }

  return {
    ok: false,
    status: 403,
    error:
      "ORBIT está en reestructuración. Tu cuenta aún no tiene acceso autorizado.",
  };
}

async function upsertUserForLogin(params: {
  personId: number;
  email: string;
  authProvider: string;
  authProviderId: string;
  userTable: string | null | undefined;
}): Promise<number> {
  const { personId, email, authProvider, authProviderId, userTable } = params;
  if (!userTable) return 0;

  let userId = 0;
  try {
    const existingUser = await pool.query(
      `SELECT id, username
       FROM "user"
       WHERE person_id = $1
       LIMIT 1`,
      [personId]
    );

    if (existingUser.rows.length > 0) {
      userId = Number(existingUser.rows[0].id);
      try {
        await pool.query(
          `UPDATE "user" SET
             username = $1,
             auth_provider = $2,
             auth_provider_id = $3,
             last_login_at = NOW(),
             updated_at = NOW()
           WHERE id = $4`,
          [email, authProvider, authProviderId, userId]
        );
      } catch (e: unknown) {
        const err = e as { code?: string };
        if (err.code === "23505") {
          await pool.query(
            `UPDATE "user" SET
               username = NULL,
               auth_provider = $1,
               auth_provider_id = $2,
               last_login_at = NOW(),
               updated_at = NOW()
             WHERE id = $3`,
            [authProvider, authProviderId, userId]
          );
        } else {
          throw e;
        }
      }
    } else {
      try {
        const insert = await pool.query(
          `INSERT INTO "user" (
             person_id,
             username,
             auth_provider,
             auth_provider_id,
             last_login_at
           ) VALUES ($1, $2, $3, $4, NOW())
           RETURNING id`,
          [personId, email, authProvider, authProviderId]
        );
        userId = Number(insert.rows[0].id);
      } catch (e: unknown) {
        const err = e as { code?: string };
        // 23502: id NOT NULL sin DEFAULT/sequence — asignar MAX(id)+1
        if (err.code === "23502") {
          const insert = await pool.query(
            `INSERT INTO "user" (
               id,
               person_id,
               username,
               auth_provider,
               auth_provider_id,
               last_login_at
             )
             SELECT
               COALESCE((SELECT MAX(u.id) FROM "user" u), 0) + 1,
               $1, $2, $3, $4, NOW()
             RETURNING id`,
            [personId, email, authProvider, authProviderId]
          );
          userId = Number(insert.rows[0].id);
        } else if (err.code === "23505") {
          const insert = await pool.query(
            `INSERT INTO "user" (
               person_id,
               username,
               auth_provider,
               auth_provider_id,
               last_login_at
             ) VALUES ($1, NULL, $2, $3, NOW())
             RETURNING id`,
            [personId, authProvider, authProviderId]
          );
          userId = Number(insert.rows[0].id);
        } else {
          throw e;
        }
      }
    }
  } catch (err) {
    console.warn("Skipping user table upsert:", err);
    userId = 0;
  }
  return userId;
}

type AuthSuccessBody = {
  token: string;
  user: {
    id: number;
    personId: number;
    email: string;
    name: string;
    picture?: string;
    roleId: number | null;
    roleCode: string | null;
    roleName: string | null;
    orbitAccess: OrbitAccess;
    capabilities: OrbitCapability[];
    /** Presente en grants de Planta Activa; admin no lo necesita. */
    plantaActivaAccess?: {
      viewAreaIds: number[] | null;
      editAreaIds: number[] | null;
      hierarchyScoped?: boolean;
      coordinationSchoolId?: number | null;
      personalDataOnly?: boolean;
    };
  };
};

async function buildTokenResponse(params: {
  person: PersonRow;
  orbitAccess: OrbitAccess;
  capabilities: OrbitCapability[];
  schoolId: number | null;
  areaId: number | null;
  programIds: number[];
  plantaViewAreaIds: number[] | null;
  plantaEditAreaIds: number[] | null;
  email: string;
  displayName: string;
  picture: string;
  sub: string;
  userId: number;
}): Promise<AuthSuccessBody> {
  const jwtSecret = getRequiredEnv("JWT_SECRET");
  const signOptions: SignOptions = {
    // Política de seguridad Orbit: toda sesión expira exactamente a las 2 horas.
    expiresIn: ORBIT_JWT_EXPIRES_IN,
  };
  const {
    person,
    orbitAccess,
    capabilities,
    schoolId,
    areaId,
    programIds,
    plantaViewAreaIds,
    plantaEditAreaIds,
    email,
    displayName,
    picture,
    sub,
    userId,
  } = params;

  const roleId =
    person.role_id != null && Number.isFinite(Number(person.role_id))
      ? Number(person.role_id)
      : null;

  const token = jwt.sign(
    {
      userId,
      personId: Number(person.person_id),
      email,
      name: displayName,
      picture,
      sub,
      role: person.role_code ?? person.role_name ?? null,
      roleId,
      orbitAccess,
      capabilities,
      schoolId,
      areaId: areaId != null && Number.isFinite(areaId) ? areaId : null,
      programIds: orbitAccess === "lite" ? programIds : [],
      plantaViewAreaIds,
      plantaEditAreaIds,
    },
    jwtSecret,
    signOptions
  );

  const plantaActivaAccess =
    plantaEditAreaIds != null
      ? {
          viewAreaIds: plantaViewAreaIds,
          editAreaIds: plantaEditAreaIds,
          hierarchyScoped:
            orbitAccess === "lite" ||
            isAcademicCoordinatorRole({
              roleCode: person.role_code,
              roleName: person.role_name,
            }),
          coordinationSchoolId: schoolId,
          personalDataOnly: orbitAccess === "lite",
        }
      : undefined;

  recordAppLoginAsync(email, "orbit");

  return {
    token,
    user: {
      id: userId,
      personId: Number(person.person_id),
      email,
      name: person.full_name || displayName,
      picture: picture || undefined,
      roleId,
      roleCode: person.role_code ?? null,
      roleName: person.role_name ?? null,
      orbitAccess,
      capabilities,
      ...(plantaActivaAccess ? { plantaActivaAccess } : {}),
    },
  };
}

type GoogleSignInFailure = { ok: false; status: number; error: string };
type GoogleSignInSuccess = { ok: true; body: AuthSuccessBody };

async function completeGoogleSignInWithIdToken(
  idToken: string
): Promise<GoogleSignInSuccess | GoogleSignInFailure> {
  const trimmed = idToken.trim();
  if (!trimmed) {
    return { ok: false, status: 400, error: "idToken is required" };
  }

  try {
    const googleClientId = getRequiredEnv("GOOGLE_CLIENT_ID");
    const client = new OAuth2Client({ clientId: googleClientId });
    const ticket = await client.verifyIdToken({
      idToken: trimmed,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    const email = (payload?.email ?? "").trim().toLowerCase();
    const googleSub = (payload?.sub ?? "").trim();
    const name = (payload?.name ?? "").trim();
    const picture = (payload?.picture ?? "").trim();

    if (!email || !googleSub) {
      return { ok: false, status: 401, error: "Invalid Google token" };
    }

    if (!email.endsWith("@cun.edu.co")) {
      return { ok: false, status: 403, error: "Only @cun.edu.co accounts are allowed" };
    }

    const tableCheck = await pool.query(
      `SELECT to_regclass('"user"') AS user_table`
    );
    const userTable = tableCheck.rows[0]?.user_table as string | null | undefined;

    const person = await fetchPersonByEmail(email);
    if (!person) {
      return {
        ok: false,
        status: 403,
        error:
          "Tu cuenta no está registrada en ORBIT o no tiene permisos. Contacta al administrador.",
      };
    }

    const gate = await gateOrbitRoleAndLite(person, email);
    if (!gate.ok) {
      return { ok: false, status: gate.status, error: gate.error };
    }

    const personId = Number(person.person_id);
    const userId = await upsertUserForLogin({
      personId,
      email,
      authProvider: "google",
      authProviderId: googleSub,
      userTable,
    });

    const bodyOut = await buildTokenResponse({
      person,
      orbitAccess: gate.orbitAccess,
      capabilities: gate.capabilities,
      schoolId: gate.schoolId,
      areaId: gate.areaId,
      programIds: gate.programIds,
      plantaViewAreaIds: gate.plantaViewAreaIds,
      plantaEditAreaIds: gate.plantaEditAreaIds,
      email,
      displayName: name,
      picture,
      sub: googleSub,
      userId,
    });
    return { ok: true, body: bodyOut };
  } catch (e: unknown) {
    console.error("completeGoogleSignInWithIdToken failed:", e);
    const message = e instanceof Error ? e.message : String(e);
    const isProd = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
    return {
      ok: false,
      status: 500,
      error: isProd ? "Internal server error" : `Internal server error: ${message}`,
    };
  }
}

router.post(
  "/auth/google/gis-callback",
  ...gisCallbackBodyParsers,
  async (req: Request, res: Response) => {
    try {
      getOrbitFrontendBaseUrl();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      sendGisCallbackHtml(res, 500, "Error de configuración", `<p>${escapeHtml(msg)}</p>`);
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    if (!verifyGisRedirectCsrf(req, body)) {
      sendGisCallbackHtml(
        res,
        403,
        "Sesión inválida",
        "<p>No se pudo validar la solicitud de inicio de sesión (CSRF). Cierra otras pestañas e inténtalo de nuevo.</p>"
      );
      return;
    }

    const credential = typeof body.credential === "string" ? body.credential.trim() : "";
    const result = await completeGoogleSignInWithIdToken(credential);
    if (!result.ok) {
      sendGisCallbackHtml(
        res,
        result.status,
        "No se pudo entrar",
        `<p>${escapeHtml(result.error)}</p><p><a href="${escapeHtml(
          getOrbitFrontendBaseUrl()
        )}/">Volver a Orbit</a></p>`
      );
      return;
    }

    sendGisSuccessRedirect(res, result.body);
  }
);

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

router.post("/auth/google", async (req, res) => {
  try {
    const body = (req.body ?? {}) as GoogleLoginBody;
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
    const result = await completeGoogleSignInWithIdToken(idToken);
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    sendAuthSuccess(res, result.body);
  } catch (e: unknown) {
    console.error("POST /auth/google failed:", e);
    const message = e instanceof Error ? e.message : String(e);
    const isProd = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
    res.status(500).json(isProd ? { error: "Internal server error" } : { error: "Internal server error", message });
  }
});

router.post("/auth/local-email", async (req, res) => {
  try {
    if (!isLocalEmailAuthEnabled()) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const body = (req.body ?? {}) as LocalEmailBody;
    const raw = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!raw || !raw.includes("@")) {
      res.status(400).json({ error: "email is required" });
      return;
    }

    const tableCheck = await pool.query(
      `SELECT to_regclass('"user"') AS user_table`
    );
    const userTable = tableCheck.rows[0]?.user_table as string | null | undefined;

    const person = await fetchPersonByEmail(raw);
    if (!person) {
      res.status(403).json({
        error:
          "No hay una persona activa con ese correo en la base de datos, o no coincide con email / edu_email.",
      });
      return;
    }

    const gate = await gateOrbitRoleAndLite(person, raw);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
    }

    const personId = Number(person.person_id);
    const canonicalEmail =
      (person.email && person.email.trim().toLowerCase()) || raw;
    const localSub = `local-email:${canonicalEmail}`;

    const userId = await upsertUserForLogin({
      personId,
      email: canonicalEmail,
      authProvider: "local_email",
      authProviderId: localSub,
      userTable,
    });

    const bodyOut = await buildTokenResponse({
      person,
      orbitAccess: gate.orbitAccess,
      capabilities: gate.capabilities,
      schoolId: gate.schoolId,
      areaId: gate.areaId,
      programIds: gate.programIds,
      plantaViewAreaIds: gate.plantaViewAreaIds,
      plantaEditAreaIds: gate.plantaEditAreaIds,
      email: canonicalEmail,
      displayName: person.full_name || canonicalEmail,
      picture: "",
      sub: localSub,
      userId,
    });
    sendAuthSuccess(res, bodyOut);
  } catch (e: unknown) {
    console.error("POST /auth/local-email failed:", e);
    const message = e instanceof Error ? e.message : String(e);
    const isProd = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
    res.status(500).json(isProd ? { error: "Internal server error" } : { error: "Internal server error", message });
  }
});

router.get("/auth/session", orbitAuthMiddleware, (req, res) => {
  const user = req.orbitUser!;
  res.json({
    user: {
      id: user.userId,
      personId: user.personId,
      email: user.email,
      name: user.name,
      picture: user.picture,
      roleId: user.roleId,
      roleCode: user.role,
      roleName: user.role,
      orbitAccess: user.orbitAccess,
      capabilities: user.capabilities,
      plantaActivaAccess: {
        viewAreaIds: user.plantaViewAreaIds,
        editAreaIds: user.plantaEditAreaIds,
        coordinationSchoolId: user.schoolId,
        personalDataOnly: user.orbitAccess === "lite",
      },
    },
    expiresAt: user.expiresAt,
  });
});

router.post("/auth/logout", (_req, res) => {
  clearOrbitSessionCookie(res);
  res.status(204).end();
});

export default router;
