import { Router } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../db/connection";
import {
  buildLiteProgramIds,
  classifyOrbitRole,
  type OrbitAccess,
} from "../lib/orbitRoles";

const router = Router();

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
  try {
    const personResult = await pool.query(
      `SELECT
         p.id AS person_id,
         p.full_name,
         COALESCE(NULLIF(p.edu_email, ''), NULLIF(p.email, '')) AS email,
         p.role_id,
         p.school_id,
         p.program_id,
         COALESCE(ppa.programs_id, ARRAY[]::INTEGER[]) AS programs_id,
         r.code AS role_code,
         r.name AS role_name
       FROM person p
       LEFT JOIN role r ON r.id = p.role_id
       LEFT JOIN person_program_assignments ppa ON ppa.person_id = p.id
       WHERE (LOWER(p.email) = $1 OR LOWER(p.edu_email) = $1)
         AND COALESCE(p.is_active, true) = true
       LIMIT 1`,
      [emailNorm]
    );
    return (personResult.rows[0] ?? null) as PersonRow | null;
  } catch {
    return null;
  }
}

type OrbitGate =
  | { ok: true; orbitAccess: OrbitAccess; schoolId: number | null; programIds: number[] }
  | { ok: false; status: number; error: string };

function gateOrbitRoleAndLite(person: PersonRow): OrbitGate {
  const orbitAccess: OrbitAccess | null = classifyOrbitRole({
    roleId: person.role_id != null ? Number(person.role_id) : null,
    roleCode: person.role_code,
    roleName: person.role_name,
  });

  if (orbitAccess == null) {
    return {
      ok: false,
      status: 403,
      error:
        "Tu rol no tiene acceso a ORBIT. Solo pueden ingresar perfiles autorizados.",
    };
  }

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

  return { ok: true, orbitAccess, schoolId, programIds };
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
    roleCode: string | null;
    roleName: string | null;
    orbitAccess: OrbitAccess;
  };
};

async function buildTokenResponse(params: {
  person: PersonRow;
  orbitAccess: OrbitAccess;
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
    schoolId,
    programIds,
    email,
    displayName,
    picture,
    sub,
    userId,
  } = params;

  const token = jwt.sign(
    {
      userId,
      personId: Number(person.person_id),
      email,
      name: displayName,
      picture,
      sub,
      role: person.role_code ?? person.role_name ?? null,
      orbitAccess,
      schoolId: orbitAccess === "lite" ? schoolId : null,
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
      roleCode: person.role_code ?? null,
      roleName: person.role_name ?? null,
      orbitAccess,
    },
  };
}

router.post("/auth/google", async (req, res) => {
  try {
    const body = (req.body ?? {}) as GoogleLoginBody;
    const idToken = typeof body.idToken === "string" ? body.idToken.trim() : "";
    if (!idToken) {
      res.status(400).json({ error: "idToken is required" });
      return;
    }

    const googleClientId = getRequiredEnv("GOOGLE_CLIENT_ID");
    const client = new OAuth2Client({ clientId: googleClientId });
    const ticket = await client.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    const email = (payload?.email ?? "").trim().toLowerCase();
    const googleSub = (payload?.sub ?? "").trim();
    const name = (payload?.name ?? "").trim();
    const picture = (payload?.picture ?? "").trim();

    if (!email || !googleSub) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    if (!email.endsWith("@cun.edu.co")) {
      res.status(403).json({ error: "Only @cun.edu.co accounts are allowed" });
      return;
    }

    const tableCheck = await pool.query(
      `SELECT to_regclass('"user"') AS user_table`
    );
    const userTable = tableCheck.rows[0]?.user_table as string | null | undefined;

    const person = await fetchPersonByEmail(email);
    if (!person) {
      res.status(403).json({
        error:
          "Tu cuenta no está registrada en ORBIT o no tiene permisos. Contacta al administrador.",
      });
      return;
    }

    const gate = gateOrbitRoleAndLite(person);
    if (!gate.ok) {
      res.status(gate.status).json({ error: gate.error });
      return;
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
      schoolId: gate.schoolId,
      programIds: gate.programIds,
      email,
      displayName: name,
      picture,
      sub: googleSub,
      userId,
    });
    res.json(bodyOut);
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