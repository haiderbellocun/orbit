/** Scope names also cover schools and operational units that are not catalog areas. */
export function normalizeSecondInCommandScopes(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !v.trim() || v.trim().length > 200)) {
    throw new Error('Las áreas de segundo al mando deben ser nombres de entre 1 y 200 caracteres');
  }
  return [...new Set(raw.map((v: string) => v.trim().replace(/\s+/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase()))];
}
