export type TeachingModality = "presencial" | "virtual" | "mixto";
export type QuotaStatus = "under" | "ok" | "over" | "unknown";

export const TEACHING_MODALITY_LABEL: Record<TeachingModality, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  mixto: "Mixto",
};

export const QUOTA_STATUS_LABEL: Record<QuotaStatus, string> = {
  under: "Faltante",
  ok: "Completo",
  over: "Exceso",
  unknown: "Sin dato",
};

export const OCCUPANCY_STATUS_OPTIONS: { value: QuotaStatus; label: string }[] =
  [
    { value: "under", label: "Faltante" },
    { value: "ok", label: "Completo" },
    { value: "over", label: "Exceso" },
  ];

export function isTeachingModality(v: unknown): v is TeachingModality {
  return v === "presencial" || v === "virtual" || v === "mixto";
}

export function isQuotaStatus(v: unknown): v is QuotaStatus {
  return v === "under" || v === "ok" || v === "over" || v === "unknown";
}

export function teachingModalityBadgeClass(modality: TeachingModality | null): string {
  if (modality === "presencial") {
    return "border-sky-200 dark:border-sky-500/28 bg-sky-50 dark:bg-sky-500/12 text-sky-800 dark:text-sky-200";
  }
  if (modality === "virtual") {
    return "border-violet-200 dark:border-violet-500/28 bg-violet-50 dark:bg-violet-500/12 text-violet-800 dark:text-violet-200";
  }
  if (modality === "mixto") {
    return "border-amber-200 dark:border-amber-500/28 bg-amber-50 dark:bg-amber-500/12 text-amber-800 dark:text-amber-200";
  }
  return "border-orbit-border bg-orbit-interactive text-orbit-muted";
}

export function quotaStatusBadgeClass(status: QuotaStatus): string {
  if (status === "ok") return "border-emerald-200 dark:border-emerald-500/28 bg-emerald-50 dark:bg-emerald-500/12 text-emerald-800 dark:text-emerald-200";
  if (status === "under") return "border-amber-200 dark:border-amber-500/28 bg-amber-50 dark:bg-amber-500/12 text-amber-800 dark:text-amber-200";
  if (status === "over") return "border-red-200 dark:border-red-500/28 bg-red-50 dark:bg-red-500/12 text-red-800 dark:text-red-200";
  return "border-orbit-border bg-orbit-interactive text-orbit-muted";
}

export type WorkloadQuotaFields = {
  teachingModality: TeachingModality | null;
  creditsPresencial: number;
  studentsVirtual: number;
  creditTarget: number | null;
  studentTarget: number | null;
  loadIndex: number | null;
  fulfillmentPct: number | null;
  quotaStatus: QuotaStatus;
  creditsGap: number | null;
  studentsGap: number | null;
  actionHint?: string | null;
};

export function formatQuotaRatio(used: number, target: number | null): string {
  if (target == null) return String(used);
  return `${used} / ${target}`;
}

export function formatQuotaActionHint(quota: {
  teachingModality: TeachingModality | null;
  quotaStatus: QuotaStatus;
  creditsGap: number | null;
  studentsGap: number | null;
  actionHint?: string | null;
}): string | null {
  if (quota.actionHint) return quota.actionHint;
  if (quota.quotaStatus !== "under" && quota.quotaStatus !== "over") return null;
  const credits = quota.creditsGap;
  const students = quota.studentsGap;
  const hasCredits = credits != null && Math.abs(credits) >= 0.05;
  const hasStudents = students != null && Math.abs(students) >= 0.5;
  if (!hasCredits && !hasStudents) return null;
  const fmtC = (n: number) => {
    const r = Math.round(Math.abs(n) * 10) / 10;
    return Number.isInteger(r) ? String(r) : r.toFixed(1);
  };
  const fmtS = (n: number) => String(Math.max(0, Math.round(Math.abs(n))));
  const mixto = quota.teachingModality === "mixto";
  if (quota.quotaStatus === "under") {
    if (mixto && hasCredits && hasStudents) {
      return `Faltan ${fmtC(credits!)} créditos presenciales o ${fmtS(students!)} estudiantes virtuales`;
    }
    if (hasCredits) return `Faltan ${fmtC(credits!)} créditos presenciales`;
    if (hasStudents) return `Faltan ${fmtS(students!)} estudiantes virtuales`;
  }
  if (mixto && hasCredits && hasStudents) {
    return `Exceso equivalente a ${fmtC(credits!)} créditos presenciales o ${fmtS(students!)} estudiantes virtuales`;
  }
  if (hasCredits) return `Exceso de ${fmtC(credits!)} créditos presenciales`;
  if (hasStudents) return `Exceso de ${fmtS(students!)} estudiantes virtuales`;
  return null;
}
