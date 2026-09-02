export type TeachingModality = "presencial" | "virtual" | "mixto";
export type QuotaStatus = "under" | "ok" | "over" | "unknown";

export const TEACHING_MODALITY_LABEL: Record<TeachingModality, string> = {
  presencial: "Presencial",
  virtual: "Virtual",
  mixto: "Mixto",
};

export const QUOTA_STATUS_LABEL: Record<QuotaStatus, string> = {
  under: "Faltante",
  ok: "Completa",
  over: "Exceso",
  unknown: "Sin cuota",
};

export function isTeachingModality(v: unknown): v is TeachingModality {
  return v === "presencial" || v === "virtual" || v === "mixto";
}

export function isQuotaStatus(v: unknown): v is QuotaStatus {
  return v === "under" || v === "ok" || v === "over" || v === "unknown";
}

export function teachingModalityBadgeClass(modality: TeachingModality | null): string {
  if (modality === "presencial") {
    return "border-sky-200 bg-sky-50 text-sky-800";
  }
  if (modality === "virtual") {
    return "border-violet-200 bg-violet-50 text-violet-800";
  }
  if (modality === "mixto") {
    return "border-amber-200 bg-amber-50 text-amber-800";
  }
  return "border-orbit-border bg-orbit-interactive text-orbit-muted";
}

export function quotaStatusBadgeClass(status: QuotaStatus): string {
  if (status === "ok") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "under") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "over") return "border-red-200 bg-red-50 text-red-800";
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
};

export function formatQuotaRatio(used: number, target: number | null): string {
  if (target == null) return String(used);
  return `${used} / ${target}`;
}
