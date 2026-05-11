/**
 * Limita longitudes antes de persistir para cumplir VARCHAR(...) sin errores opacos del motor.
 */

export function truncateUtf(
  str: string | null | undefined,
  maxLen: number
): string | null {
  if (str == null) return null;
  const s = String(str).trim();
  if (s.length === 0) return null;
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen);
}
