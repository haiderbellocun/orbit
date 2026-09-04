/** Duración máxima e inmodificable de una sesión Orbit. */
export const ORBIT_SESSION_TTL_SECONDS = 2 * 60 * 60;
export const ORBIT_JWT_EXPIRES_IN = "2h" as const;

/**
 * Rechaza también tokens antiguos emitidos antes de reducir la sesión a 2 horas.
 * Se tolera hasta un minuto de diferencia entre relojes al validar `iat` futuro.
 */
export function isOrbitSessionActive(
  payload: { iat?: unknown },
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const issuedAt = payload.iat;
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return false;
  if (issuedAt > nowSeconds + 60) return false;
  return nowSeconds < issuedAt + ORBIT_SESSION_TTL_SECONDS;
}
