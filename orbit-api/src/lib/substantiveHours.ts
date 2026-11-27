/** Default de preparación de clase cuando no hay fila en class_preparation. */
export const DEFAULT_CLASS_PREPARATION_HOURS = 2;

/**
 * Carga virtual: cada bloque de 50 estudiantes equivale a 2 créditos (horas).
 * 50 est. = 2 h, 100 est. = 4 h, 25 est. = 1 h.
 */
export const VIRTUAL_STUDENTS_PER_BLOCK = 50;
export const VIRTUAL_HOURS_PER_BLOCK = 2;

/** Tope de referencia de estudiantes virtuales por jornada contractual. */
export function maxVirtualStudents(contractHours: number | null): number | null {
  if (contractHours === 42) return 520;
  if (contractHours === 21) return 250;
  return null;
}

/** Horas de carga de una asignación (mismo cálculo que el SQL). */
export function assignmentLoadHours(input: {
  isVirtual: boolean;
  enrolled: number | null | undefined;
  credits: number | null | undefined;
  /** Respaldo para presencial cuando la materia no trae créditos. */
  fallbackHours?: number | null;
}): number {
  if (input.isVirtual) {
    const students = Number(input.enrolled) || 0;
    return Math.round((students / VIRTUAL_STUDENTS_PER_BLOCK) * VIRTUAL_HOURS_PER_BLOCK * 100) / 100;
  }
  const credits = Number(input.credits) || 0;
  if (credits > 0) return credits;
  return Number(input.fallbackHours) || 0;
}

/** true si la modalidad cruda del grupo (V / Virtual…) es virtual. */
export function isVirtualModality(raw: unknown): boolean {
  const v = String(raw ?? "").trim().toLowerCase();
  return v === "v" || v.startsWith("vir");
}

/** SQL: la modalidad del grupo `cg` es virtual. */
export function sqlGroupIsVirtual(cg = "cg"): string {
  return `(UPPER(TRIM(COALESCE(${cg}.modality, ''))) = 'V' OR LOWER(TRIM(COALESCE(${cg}.modality, ''))) LIKE 'vir%')`;
}

/** SQL: estudiantes de la asignación (fila de carga; si viene en 0, el grupo). */
export function sqlAssignmentStudents(al = "al", cg = "cg"): string {
  return `COALESCE(NULLIF(${al}.enrolled_quantity, 0), ${cg}.enrolled_quantity, 0)`;
}

/**
 * SQL: horas de carga académica de una asignación.
 *  - Presencial: créditos de la asignatura (1 crédito = 1 h). Si la materia no
 *    trae créditos, se usan las horas importadas como respaldo.
 *  - Virtual: estudiantes ÷ 50 × 2.
 * Requiere `al` (academic_load), `subj` (subject) y `cg` (class_group) en el FROM.
 */
export function sqlAssignmentLoadHours(al = "al", subj = "subj", cg = "cg"): string {
  return `(CASE WHEN ${sqlGroupIsVirtual(cg)}
      THEN ROUND(${sqlAssignmentStudents(al, cg)}::numeric / ${VIRTUAL_STUDENTS_PER_BLOCK} * ${VIRTUAL_HOURS_PER_BLOCK}, 2)
      ELSE COALESCE(NULLIF(${subj}.credits_quantity, 0), NULLIF(${subj}.hours_quantity, 0), NULLIF(${al}.substantive_hours_quantity, 0), 0)
    END)`;
}

/** SQL: JOINs de materia y grupo que necesita `sqlAssignmentLoadHours`. */
export function sqlAssignmentLoadJoins(al = "al", subj = "subj", cg = "cg"): string {
  return `LEFT JOIN academic_workload.subject ${subj} ON ${subj}.subject_code = ${al}.subject_code
      LEFT JOIN academic_workload.class_group ${cg}
        ON ${cg}.subject_code = ${al}.subject_code AND ${cg}.group_code = ${al}.group_code`;
}

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
