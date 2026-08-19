/** Default de preparación de clase cuando no hay fila en class_preparation. */
export const DEFAULT_CLASS_PREPARATION_HOURS = 4;

/** Placeholder hasta que definan el catálogo real de categorías. */
export const PLACEHOLDER_SUBSTANTIVE_CATEGORY =
  "PEDIR LISTA CATEGORIAS HORAS SUSTANTIVAS";

/**
 * Horas semanales de contrato por dedicación.
 * Tiempo completo = 42; medio tiempo = 21.
 */
export function weeklyContractHoursFromLabels(
  workSchedule: string | null | undefined,
  contractName: string | null | undefined
): number | null {
  const blob = `${workSchedule ?? ""} ${contractName ?? ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!blob.trim()) return null;
  if (
    /\bmedio\b/.test(blob) ||
    /\bmedia\b/.test(blob) ||
    /medio\s*tiempo/.test(blob) ||
    /\b1\/2\b/.test(blob) ||
    /\b21\b/.test(blob)
  ) {
    return 21;
  }
  if (
    /tiempo\s*completo/.test(blob) ||
    /\bcompleto\b/.test(blob) ||
    /\bfull\b/.test(blob) ||
    /\b42\b/.test(blob)
  ) {
    return 42;
  }
  return null;
}

export function parsePositiveIntHours(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 1) return raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!/^\d+$/.test(t)) return null;
    const n = Number.parseInt(t, 10);
    return Number.isFinite(n) && n >= 1 ? n : null;
  }
  return null;
}
