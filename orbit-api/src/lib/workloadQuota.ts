/**
 * Cuota académica por modalidad de enseñanza (créditos P / estudiantes V).
 * Independiente del balance horario semanal (42/21).
 */

export const CREDIT_TARGET_FULL = 28;
export const CREDIT_TARGET_HALF = 14;
export const STUDENT_TARGET_FULL = 500;
export const STUDENT_TARGET_HALF = 250;

/** Banda de "completa": |loadIndex - 1| <= tolerancia. */
export const QUOTA_TOLERANCE = 0.02;

export type TeachingModality = "presencial" | "virtual" | "mixto";
export type QuotaStatus = "under" | "ok" | "over" | "unknown";

export type WorkloadQuotaInput = {
  contractHours: number | null | undefined;
  creditsP: number;
  studentsV: number;
  hasP?: boolean;
  hasV?: boolean;
};

export type WorkloadQuotaResult = {
  modality: TeachingModality | null;
  creditsP: number;
  studentsV: number;
  creditTarget: number | null;
  studentTarget: number | null;
  loadIndex: number | null;
  fulfillmentPct: number | null;
  status: QuotaStatus;
  /**
   * Equivalente a completar (o exceso si negativo).
   * En mixto no es meta−usado, sino (1 − loadIndex) × meta.
   */
  creditsGap: number | null;
  studentsGap: number | null;
  actionHint: string | null;
};

export function classifyGroupModality(
  raw: string | null | undefined
): "P" | "V" | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const ascii = s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (
    ascii === "V" ||
    ascii === "T" ||
    ascii === "VIRTUAL" ||
    ascii.startsWith("VIR")
  ) {
    return "V";
  }
  if (ascii === "P" || ascii === "PRESENCIAL" || ascii.startsWith("PRES")) {
    return "P";
  }
  return null;
}

export function inferTeacherModality(
  hasP: boolean,
  hasV: boolean
): TeachingModality | null {
  if (hasP && hasV) return "mixto";
  if (hasP) return "presencial";
  if (hasV) return "virtual";
  return null;
}

export function quotaTargetsFromContractHours(
  contractHours: number | null | undefined
): { creditTarget: number | null; studentTarget: number | null } {
  if (contractHours === 42) {
    return {
      creditTarget: CREDIT_TARGET_FULL,
      studentTarget: STUDENT_TARGET_FULL,
    };
  }
  if (contractHours === 21) {
    return {
      creditTarget: CREDIT_TARGET_HALF,
      studentTarget: STUDENT_TARGET_HALF,
    };
  }
  return { creditTarget: null, studentTarget: null };
}

function finiteNonNeg(n: unknown): number {
  const v = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return v;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function fmtCreditsEq(n: number): string {
  const r = round1(Math.abs(n));
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function fmtStudentsEq(n: number): string {
  return String(Math.max(0, Math.round(Math.abs(n))));
}

/** Mensaje para armar carga: faltante o exceso en unidades nativas. */
export function formatQuotaActionHint(result: {
  modality: TeachingModality | null;
  status: QuotaStatus;
  creditsGap: number | null;
  studentsGap: number | null;
}): string | null {
  if (result.status !== "under" && result.status !== "over") return null;
  const credits = result.creditsGap;
  const students = result.studentsGap;
  const hasCredits = credits != null && Math.abs(credits) >= 0.05;
  const hasStudents = students != null && Math.abs(students) >= 0.5;
  if (!hasCredits && !hasStudents) return null;

  if (result.status === "under") {
    if (result.modality === "mixto" && hasCredits && hasStudents) {
      return `Faltan ${fmtCreditsEq(credits!)} créditos presenciales o ${fmtStudentsEq(students!)} estudiantes virtuales`;
    }
    if (hasCredits) return `Faltan ${fmtCreditsEq(credits!)} créditos presenciales`;
    if (hasStudents) return `Faltan ${fmtStudentsEq(students!)} estudiantes virtuales`;
  }

  if (result.modality === "mixto" && hasCredits && hasStudents) {
    return `Exceso equivalente a ${fmtCreditsEq(credits!)} créditos presenciales o ${fmtStudentsEq(students!)} estudiantes virtuales`;
  }
  if (hasCredits) return `Exceso de ${fmtCreditsEq(credits!)} créditos presenciales`;
  if (hasStudents) return `Exceso de ${fmtStudentsEq(students!)} estudiantes virtuales`;
  return null;
}

export function quotaStatusFromLoadIndex(
  loadIndex: number | null
): QuotaStatus {
  if (loadIndex == null || !Number.isFinite(loadIndex)) return "unknown";
  if (loadIndex < 1 - QUOTA_TOLERANCE) return "under";
  if (loadIndex > 1 + QUOTA_TOLERANCE) return "over";
  return "ok";
}

export function evaluateWorkloadQuota(
  input: WorkloadQuotaInput
): WorkloadQuotaResult {
  const creditsP = finiteNonNeg(input.creditsP);
  const studentsV = finiteNonNeg(input.studentsV);
  const hasP =
    typeof input.hasP === "boolean" ? input.hasP : creditsP > 0;
  const hasV =
    typeof input.hasV === "boolean" ? input.hasV : studentsV > 0;
  const modality = inferTeacherModality(hasP, hasV);
  const { creditTarget, studentTarget } = quotaTargetsFromContractHours(
    input.contractHours
  );

  if (modality == null || creditTarget == null || studentTarget == null) {
    return {
      modality,
      creditsP,
      studentsV,
      creditTarget,
      studentTarget,
      loadIndex: null,
      fulfillmentPct: null,
      status: "unknown",
      creditsGap: null,
      studentsGap: null,
      actionHint: null,
    };
  }

  let loadIndex = 0;
  if (modality === "presencial") {
    loadIndex = creditsP / creditTarget;
  } else if (modality === "virtual") {
    loadIndex = studentsV / studentTarget;
  } else {
    loadIndex = creditsP / creditTarget + studentsV / studentTarget;
  }

  const status = quotaStatusFromLoadIndex(loadIndex);
  const remainingIndex = 1 - loadIndex;
  let creditsGap: number | null = null;
  let studentsGap: number | null = null;
  if (modality === "presencial") {
    creditsGap = round1(creditTarget - creditsP);
  } else if (modality === "virtual") {
    studentsGap = round1(studentTarget - studentsV);
  } else {
    creditsGap = round1(remainingIndex * creditTarget);
    studentsGap = round1(remainingIndex * studentTarget);
  }

  const result: WorkloadQuotaResult = {
    modality,
    creditsP,
    studentsV,
    creditTarget,
    studentTarget,
    loadIndex,
    fulfillmentPct: round1(loadIndex * 100),
    status,
    creditsGap,
    studentsGap,
    actionHint: null,
  };
  result.actionHint = formatQuotaActionHint(result);
  return result;
}

export function sqlGroupIsPresencial(alias = "cg"): string {
  return `(UPPER(TRIM(COALESCE(${alias}.modality, ''))) IN ('P', 'PRESENCIAL')
    OR LOWER(TRIM(COALESCE(${alias}.modality, ''))) LIKE 'pres%')`;
}

export function sqlGroupIsVirtual(alias = "cg"): string {
  return `(UPPER(TRIM(COALESCE(${alias}.modality, ''))) IN ('V', 'T', 'VIRTUAL')
    OR LOWER(TRIM(COALESCE(${alias}.modality, ''))) LIKE 'vir%')`;
}

/** SQL CASE: presencial | virtual | mixto | NULL. */
export function sqlTeachingModalityExpr(
  hasPExpr: string,
  hasVExpr: string
): string {
  return `CASE
    WHEN (${hasPExpr}) AND (${hasVExpr}) THEN 'mixto'
    WHEN (${hasPExpr}) THEN 'presencial'
    WHEN (${hasVExpr}) THEN 'virtual'
    ELSE NULL
  END`;
}

export function sqlQuotaLoadIndexExpr(opts: {
  contractHoursExpr: string;
  creditsPExpr: string;
  studentsVExpr: string;
  hasPExpr: string;
  hasVExpr: string;
}): string {
  const creditTarget = `CASE
    WHEN (${opts.contractHoursExpr}) = 42 THEN ${CREDIT_TARGET_FULL}
    WHEN (${opts.contractHoursExpr}) = 21 THEN ${CREDIT_TARGET_HALF}
    ELSE NULL END`;
  const studentTarget = `CASE
    WHEN (${opts.contractHoursExpr}) = 42 THEN ${STUDENT_TARGET_FULL}
    WHEN (${opts.contractHoursExpr}) = 21 THEN ${STUDENT_TARGET_HALF}
    ELSE NULL END`;
  return `CASE
    WHEN (${opts.hasPExpr}) AND (${opts.hasVExpr})
         AND (${creditTarget}) IS NOT NULL AND (${studentTarget}) IS NOT NULL
      THEN (${opts.creditsPExpr})::numeric / (${creditTarget})
         + (${opts.studentsVExpr})::numeric / (${studentTarget})
    WHEN (${opts.hasPExpr}) AND NOT (${opts.hasVExpr}) AND (${creditTarget}) IS NOT NULL
      THEN (${opts.creditsPExpr})::numeric / (${creditTarget})
    WHEN (${opts.hasVExpr}) AND NOT (${opts.hasPExpr}) AND (${studentTarget}) IS NOT NULL
      THEN (${opts.studentsVExpr})::numeric / (${studentTarget})
    ELSE NULL
  END`;
}

export function sqlQuotaStatusExpr(loadIndexExpr: string): string {
  const lo = 1 - QUOTA_TOLERANCE;
  const hi = 1 + QUOTA_TOLERANCE;
  return `CASE
    WHEN (${loadIndexExpr}) IS NULL THEN 'unknown'
    WHEN (${loadIndexExpr}) < ${lo} THEN 'under'
    WHEN (${loadIndexExpr}) > ${hi} THEN 'over'
    ELSE 'ok'
  END`;
}

export function quotaApiFields(result: WorkloadQuotaResult) {
  return {
    teachingModality: result.modality,
    creditsPresencial: result.creditsP,
    studentsVirtual: result.studentsV,
    creditTarget: result.creditTarget,
    studentTarget: result.studentTarget,
    loadIndex:
      result.loadIndex == null
        ? null
        : Math.round(result.loadIndex * 10000) / 10000,
    fulfillmentPct: result.fulfillmentPct,
    quotaStatus: result.status,
    creditsGap: result.creditsGap,
    studentsGap: result.studentsGap,
    actionHint: result.actionHint,
  };
}
