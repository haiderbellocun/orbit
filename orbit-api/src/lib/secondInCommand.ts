/** Los alcances pueden ser áreas, escuelas o unidades operativas. */
export function normalizeSecondInCommandScopes(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.some((value) =>
    typeof value !== "string" || !value.trim() || value.trim().length > 200
  )) {
    throw new Error("Las áreas de segundo al mando deben ser nombres de entre 1 y 200 caracteres");
  }
  return [...new Set(raw.map((value: string) => value.trim().replace(/\s+/g, " ")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase()))];
}
