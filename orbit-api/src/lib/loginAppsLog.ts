import { pool } from "../db/connection";

export type LoginAppName = "actas" | "orbit" | "nova" | "acervo";

const TZ = "America/Bogota";

/**
 * Registra un login en logs.login_apps (fecha/hora en America/Bogota).
 * No lanza: el login de la app no debe fallar por auditoría.
 */
export async function recordAppLogin(
  email: string,
  appLogin: LoginAppName
): Promise<void> {
  const correo = String(email ?? "")
    .trim()
    .toLowerCase();
  if (!correo) return;

  try {
    await pool.query(
      `
      INSERT INTO logs.login_apps (correo, fecha, hora, app_login)
      VALUES (
        $1,
        (CURRENT_TIMESTAMP AT TIME ZONE $3)::date,
        (CURRENT_TIMESTAMP AT TIME ZONE $3)::time,
        $2
      )
      `,
      [correo, appLogin, TZ]
    );
  } catch (error) {
    console.warn("[loginAppsLog] No se pudo registrar login:", error);
  }
}

/** Fire-and-forget wrapper. */
export function recordAppLoginAsync(
  email: string,
  appLogin: LoginAppName
): void {
  void recordAppLogin(email, appLogin);
}
