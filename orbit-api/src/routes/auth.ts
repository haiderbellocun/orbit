import { Router } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../db/connection";

const router = Router();

type GoogleLoginBody = {
  idToken?: unknown;
  credential?: unknown;
};

type PersonRow = {
  person_id: number;
  full_name: string;
  email: string | null;
  role_code: string | null;
  role_name: string | null;
};

function getRequiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

function getOptionalEnv(name: string): string {
  return (process.env[name] ?? "").trim();
}

router.post("/auth/google", async (req, res) => {
  try {
    const body = (req.body ?? {}) as GoogleLoginBody;
    // Frontend puede enviar `idToken` o `credential` dependiendo del wrapper.
    const idToken =
      (typeof body.credential === "string" ? body.credential : "") ||
      (typeof body.idToken === "string" ? body.idToken : "");
    const idTokenTrimmed = typeof idToken === "string" ? idToken.trim() : "";
    if (!idTokenTrimmed) {
      res.status(400).json({ error: "credential (or idToken) is required" });
      return;
    }

    console.info("POST /api/auth/google called", {
      hasCredential: typeof body.credential === "string" && Boolean(body.credential.trim()),
      hasIdToken: typeof body.idToken === "string" && Boolean(body.idToken.trim()),
    });

    const googleClientId = getRequiredEnv("GOOGLE_CLIENT_ID");
    const jwtSecret = getOptionalEnv("JWT_SECRET");
    const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "7d").trim() || "7d";
    const signOptions: SignOptions = {
      expiresIn: jwtExpiresIn as SignOptions["expiresIn"],
    };

    const client = new OAuth2Client({ clientId: googleClientId });
    let payload: unknown;
    try {
      const ticket = await client.verifyIdToken({
        idToken: idTokenTrimmed,
        audience: googleClientId,
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.warn("Google token verification failed:", verifyErr);
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    const p = payload as {
      email?: unknown;
      sub?: unknown;
      name?: unknown;
      picture?: unknown;
    } | null;

    const email = (typeof p?.email === "string" ? p.email : "")
      .trim()
      .toLowerCase();
    const googleSub = (typeof p?.sub === "string" ? p.sub : "").trim();
    const name = (typeof p?.name === "string" ? p.name : "").trim();
    const picture = (typeof p?.picture === "string" ? p.picture : "").trim();

    if (!email || !googleSub) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    if (!email.endsWith("@cun.edu.co")) {
      res.status(403).json({ error: "Only @cun.edu.co accounts are allowed" });
      return;
    }

    // DB lookups son opcionales: si la BD no está disponible, igual devolvemos login válido.
    let person: PersonRow | null = null;

    let userId = 0;

    try {
      const tableCheck = await pool.query(
        `SELECT
           to_regclass('person') AS person_table,
           to_regclass('"user"') AS user_table`
      );
      const personTable = tableCheck.rows[0]?.person_table as
        | string
        | null
        | undefined;
      const userTable = tableCheck.rows[0]?.user_table as string | null | undefined;

      if (personTable) {
        const personResult = await pool.query(
          `SELECT
             p.id AS person_id,
             p.full_name,
             COALESCE(NULLIF(p.edu_email, ''), NULLIF(p.email, '')) AS email,
             r.code AS role_code,
             r.name AS role_name
           FROM person p
           LEFT JOIN role r ON r.id = p.role_id
           WHERE LOWER(p.email) = $1 OR LOWER(p.edu_email) = $1
           LIMIT 1`,
          [email]
        );
        person = (personResult.rows[0] ?? null) as PersonRow | null;
      }

      const personId = person ? Number(person.person_id) : null;
      const usernameCandidate = email;
      const canInsertLocalUser = personId != null && Number.isFinite(personId);

      if (userTable) {
        const existingUser = personId
          ? await pool.query(
              `SELECT id, username
               FROM "user"
               WHERE person_id = $1
               LIMIT 1`,
              [personId]
            )
          : await pool.query(
              `SELECT id, username, person_id
               FROM "user"
               WHERE auth_provider = 'google' AND auth_provider_id = $1
               LIMIT 1`,
              [googleSub]
            );

        if (existingUser.rows.length > 0) {
          userId = Number(existingUser.rows[0].id);
          try {
            await pool.query(
              `UPDATE "user" SET
                 username = $1,
                 auth_provider = 'google',
                 auth_provider_id = $2,
                 last_login_at = NOW(),
                 updated_at = NOW()
               WHERE id = $3`,
              [usernameCandidate, googleSub, userId]
            );
          } catch (e: unknown) {
            const err = e as { code?: string };
            if (err.code === "23505") {
              await pool.query(
                `UPDATE "user" SET
                   username = NULL,
                   auth_provider = 'google',
                   auth_provider_id = $1,
                   last_login_at = NOW(),
                   updated_at = NOW()
                 WHERE id = $2`,
                [googleSub, userId]
              );
            } else {
              throw e;
            }
          }
        } else if (!canInsertLocalUser) {
          console.info(
            "Skipping local user insert: personId is null (login continues)."
          );
        } else {
          try {
            const insert = await pool.query(
              `INSERT INTO "user" (
                 person_id,
                 username,
                 auth_provider,
                 auth_provider_id,
                 last_login_at
               ) VALUES ($1, $2, 'google', $3, NOW())
               RETURNING id`,
              [personId, usernameCandidate, googleSub]
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
                 ) VALUES ($1, NULL, 'google', $2, NOW())
                 RETURNING id`,
                [personId, googleSub]
              );
              userId = Number(insert.rows[0].id);
            } else {
              throw e;
            }
          }
        }
      }
    } catch (dbErr) {
      console.warn("Auth DB lookup skipped (login continues):", dbErr);
      person = null;
      userId = 0;
    }
    const tokenPayload = {
      userId,
      email,
      name,
      picture,
      sub: googleSub,
      role: person?.role_code ?? person?.role_name ?? null,
    };

    const token = jwtSecret
      ? jwt.sign(tokenPayload, jwtSecret, signOptions)
      : `mock:${email}`;

    res.json({
      token,
      user: {
        email,
        name: person?.full_name || name,
        picture,
      },
    });
  } catch (e: unknown) {
    console.error("POST /api/auth/google failed:", e);
    const message = e instanceof Error ? e.message : String(e);
    const isProd = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
    res.status(500).json(isProd ? { error: "Internal server error" } : { error: "Internal server error", message });
  }
});

export default router;
