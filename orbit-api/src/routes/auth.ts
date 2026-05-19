import express, { Router, type Request, type Response } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../db/connection";
import { buildLiteProgramIds } from "../lib/orbitRoles";
import {
  resolveOrbitAccess,
  type OrbitAccess,
  type OrbitCapability,
} from "../lib/orbitCapabilities";

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
  if (cookieTok && bodyTok) return cookieTok === bodyTok;
  // Si solo llega una de las dos (muy habitual: `g_csrf_token` en el POST pero la cookie quedó en el origen del SPA
  // y no se envía al `login_uri` en otro host), no podemos comparar; la autenticación real es verifyIdToken(credential).
  return true;
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
  const tokenJs = JSON.stringify(auth.token);
  res
    .status(200)
    .type("html")
    .send(`<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>Entrando…</title></head>
<body>
<script>
  localStorage.setItem("orbit_jwt", ${tokenJs});
  localStorage.setItem("orbit_user", ${JSON.stringify(JSON.stringify(auth.user))});
  location.replace(${JSON.stringify(target)});
</script>
<p>Entrando a Orbit…</p>
</body></html>`);
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
         p.school_id,
         p.program_id,
         ${programsSelect},
         r.code AS role_code,
         r.name AS role_name
       FROM person p
       LEFT JOIN role r ON r.id = p.role_id
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
      programIds: number[];
    }
  | { ok: false; status: number; error: string };

function gateOrbitRoleAndLite(person: PersonRow): OrbitGate {
  const resolved = resolveOrbitAccess({
    roleId: person.role_id != null ? Number(person.role_id) : null,
    roleCode: person.role_code,
    roleName: person.role_name,
  });

  if (resolved == null) {
    return {
      ok: false,
      status: 403,
      error:
        "Tu rol no tiene acceso a ORBIT. Solo pueden ingresar perfiles autorizados.",
    };
  }

  const { orbitAccess, capabilities } = resolved;

  let schoolId: number | null = null;
  let programIds: number[] = [];

  if (orbitAccess === "lite") {
    schoolId = person.school_id != null ? Number(person.school_id) : null;
    programIds = buildLiteProgramIds(
      person.program_id != null ? Number(person.program_id) : null,
      person.programs_id
    );
    if (schoolId == null || Number.isNaN(schoolId) || programIds.length === 0) {
      return {
        ok: false,
        status: 403,
        error:
          "Tu perfil LITE no tiene escuela o programa asignado. Completa los datos en el sistema central antes de usar ORBIT.",
      };
    }
  }

  if (orbitAccess === "school") {
    schoolId = person.school_id != null ? Number(person.school_id) : null;
    if (schoolId == null || Number.isNaN(schoolId)) {
      return {
        ok: false,
        status: 403,
        error:
          "Tu perfil de coordinador de escuela no tiene escuela asignada. Completa los datos en el sistema central antes de usar ORBIT.",
      };
    }
  }

  return { ok: true, orbitAccess, capabilities, schoolId, programIds };
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
        if (err.code === "23505") {
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
  };
};

async function buildTokenResponse(params: {
  person: PersonRow;
  orbitAccess: OrbitAccess;
  capabilities: OrbitCapability[];
  schoolId: number | null;
  programIds: number[];
  email: string;
  displayName: string;
  picture: string;
  sub: string;
  userId: number;
}): Promise<AuthSuccessBody> {
  const jwtSecret = getRequiredEnv("JWT_SECRET");
  const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "7d").trim() || "7d";
  const signOptions: SignOptions = {
    expiresIn: jwtExpiresIn as SignOptions["expiresIn"],
  };
  const {
    person,
    orbitAccess,
    capabilities,
    schoolId,
    programIds,
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
      schoolId:
        orbitAccess === "lite" || orbitAccess === "school" ? schoolId : null,
      programIds: orbitAccess === "lite" ? programIds : [],
    },
    jwtSecret,
    signOptions
  );

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

    const gate = gateOrbitRoleAndLite(person);
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
      programIds: gate.programIds,
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
    res.json(result.body);
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

    const gate = gateOrbitRoleAndLite(person);
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
      programIds: gate.programIds,
      email: canonicalEmail,
      displayName: person.full_name || canonicalEmail,
      picture: "",
      sub: localSub,
      userId,
    });
    res.json(bodyOut);
  } catch (e: unknown) {
    console.error("POST /auth/local-email failed:", e);
    const message = e instanceof Error ? e.message : String(e);
    const isProd = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
    res.status(500).json(isProd ? { error: "Internal server error" } : { error: "Internal server error", message });
  }
});

export default router;