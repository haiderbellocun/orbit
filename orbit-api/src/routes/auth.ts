import { Router } from "express";
import jwt, { type SignOptions } from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";
import { pool } from "../db/connection";

const router = Router();

type GoogleLoginBody = {
  idToken?: unknown;
};

function getRequiredEnv(name: string): string {
  const v = (process.env[name] ?? "").trim();
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
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
    const jwtSecret = getRequiredEnv("JWT_SECRET");
    const jwtExpiresIn = (process.env.JWT_EXPIRES_IN ?? "7d").trim() || "7d";
    const signOptions: SignOptions = {
      expiresIn: jwtExpiresIn as SignOptions["expiresIn"],
    };

    const client = new OAuth2Client({ clientId: googleClientId });
    const ticket = await client.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    const payload = ticket.getPayload();

    const email = (payload?.email ?? "").trim().toLowerCase();
    const googleSub = (payload?.sub ?? "").trim();
    const name = (payload?.name ?? "").trim();

    if (!email || !googleSub) {
      res.status(401).json({ error: "Invalid Google token" });
      return;
    }

    if (!email.endsWith("@cun.edu.co")) {
      res.status(403).json({ error: "Only @cun.edu.co accounts are allowed" });
      return;
    }

    const tableCheck = await pool.query(
      `SELECT
         to_regclass('person') AS person_table,
         to_regclass('"user"') AS user_table`
    );
    const personTable = tableCheck.rows[0]?.person_table as string | null | undefined;
    const userTable = tableCheck.rows[0]?.user_table as string | null | undefined;

    const person = (await (async () => {
      if (!personTable) return null;
      try {
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

        return (personResult.rows[0] ?? null) as
          | {
              person_id: number;
              full_name: string;
              email: string | null;
              role_code: string | null;
              role_name: string | null;
            }
          | null;
      } catch {
        return null;
      }
    })()) as
      | {
          person_id: number;
          full_name: string;
          email: string | null;
          role_code: string | null;
          role_name: string | null;
        }
      | null;

    const personId = person ? Number(person.person_id) : null;
    const usernameCandidate = email;

    let userId = 0;

    if (userTable) {
      try {
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
      } catch (err) {
        console.warn("Skipping user table upsert:", err);
        userId = 0;
      }
    }

    const token = jwt.sign(
      {
        userId,
        personId,
        email,
        name,
        sub: googleSub,
        role: person?.role_code ?? person?.role_name ?? null,
      },
      jwtSecret,
      signOptions
    );

    res.json({
      token,
      user: {
        id: userId,
        personId,
        email,
        name: person?.full_name || name,
        roleCode: person?.role_code ?? null,
        roleName: person?.role_name ?? null,
      },
    });
  } catch (e: unknown) {
    console.error("POST /auth/google failed:", e);
    const message = e instanceof Error ? e.message : String(e);
    const isProd = (process.env.NODE_ENV ?? "").trim().toLowerCase() === "production";
    res.status(500).json(isProd ? { error: "Internal server error" } : { error: "Internal server error", message });
  }
});

export default router;
