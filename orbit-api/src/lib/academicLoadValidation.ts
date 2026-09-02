import {
  DEFAULT_CLASS_PREPARATION_HOURS,
  weeklyContractHoursFromLabels,
} from "./substantiveHours";
import {
  classifyGroupModality,
  evaluateWorkloadQuota,
} from "./workloadQuota";

export { DEFAULT_CLASS_PREPARATION_HOURS, weeklyContractHoursFromLabels };

export type ImportValidationCode =
  | "over_capacity"
  | "schedule_conflict"
  | "hours_overload"
  | "missing_contract_hours"
  | "missing_subject_hours"
  | "quota_under"
  | "quota_over";

export interface ImportValidationIssue {
  code: ImportValidationCode;
  severity: "warning" | "error";
  personId?: number;
  document?: string | null;
  personName?: string | null;
  periodCode?: string | null;
  subjectCode?: string | null;
  groupCode?: string | null;
  message: string;
  detail?: Record<string, unknown>;
}

export interface NormalizedAssignmentForValidation {
  index: number;
  personId: number;
  document: string;
  personName?: string | null;
  periodCode: string;
  subjectCode: string;
  groupCode: string;
  /** Horas de cátedra de la materia (JSON subject.hours_quantity). */
  subjectHours: number;
  enrolledQuantity: number | null;
  capacity: number | null;
  startDate: string | null;
  endDate: string | null;
  /** Minutos desde medianoche; null si no parseable. */
  startMinutes: number | null;
  endMinutes: number | null;
  block: string | null;
  creditsQuantity?: number | null;
  modality?: string | null;
}

export interface PersonHoursContext {
  personId: number;
  document?: string | null;
  fullName?: string | null;
  workSchedule?: string | null;
  contractName?: string | null;
  preparationHours: number;
  substantiveAssigned: number;
}

/** Parsea "HH:MM", "H:MM", "HH:MM:SS" o "H:MM AM/PM" → minutos desde 00:00. */
export function parseTimeToMinutes(value: unknown): number | null {
  if (value == null || value === "") return null;
  const s = String(value).trim();
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (ampm) {
    let h = Number.parseInt(ampm[1], 10);
    const m = Number.parseInt(ampm[2], 10);
    const ap = ampm[4].toUpperCase();
    if (h === 12) h = 0;
    if (ap === "PM") h += 12;
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (m24) {
    const h = Number.parseInt(m24[1], 10);
    const m = Number.parseInt(m24[2], 10);
    if (h > 23 || m > 59) return null;
    return h * 60 + m;
  }
  return null;
}

export function dateRangesOverlap(
  aStart: string | null,
  aEnd: string | null,
  bStart: string | null,
  bEnd: string | null
): boolean {
  // Sin fechas: asumir posible solape (misma ventana académica).
  if (!aStart && !aEnd && !bStart && !bEnd) return true;
  const as = aStart ?? "0001-01-01";
  const ae = aEnd ?? "9999-12-31";
  const bs = bStart ?? "0001-01-01";
  const be = bEnd ?? "9999-12-31";
  return as <= be && bs <= ae;
}

export function timesOverlap(
  aStart: number | null,
  aEnd: number | null,
  bStart: number | null,
  bEnd: number | null
): boolean {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) {
    return false;
  }
  // Intervalo [start, end) — si end <= start (cruza medianoche), no modelamos.
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && bStart < aEnd;
}

function sameBlock(a: string | null, b: string | null): boolean {
  const na = (a ?? "").trim().toLowerCase();
  const nb = (b ?? "").trim().toLowerCase();
  if (!na || !nb) return true; // sin bloque: no filtrar
  return na === nb;
}

export function findOverCapacityIssues(
  rows: NormalizedAssignmentForValidation[]
): ImportValidationIssue[] {
  const issues: ImportValidationIssue[] = [];
  for (const r of rows) {
    if (r.enrolledQuantity == null || r.capacity == null) continue;
    if (r.capacity < 0) continue;
    if (r.enrolledQuantity > r.capacity) {
      issues.push({
        code: "over_capacity",
        severity: "warning",
        personId: r.personId,
        document: r.document,
        personName: r.personName ?? null,
        periodCode: r.periodCode,
        subjectCode: r.subjectCode,
        groupCode: r.groupCode,
        message: `Matriculados (${r.enrolledQuantity}) superan cupo (${r.capacity})`,
        detail: {
          enrolled: r.enrolledQuantity,
          capacity: r.capacity,
          index: r.index,
        },
      });
    }
  }
  return issues;
}

export function findScheduleConflictIssues(
  rows: NormalizedAssignmentForValidation[]
): ImportValidationIssue[] {
  const byPersonPeriod = new Map<string, NormalizedAssignmentForValidation[]>();
  for (const r of rows) {
    const key = `${r.personId}::${r.periodCode}`;
    const list = byPersonPeriod.get(key) ?? [];
    list.push(r);
    byPersonPeriod.set(key, list);
  }

  const issues: ImportValidationIssue[] = [];
  for (const group of byPersonPeriod.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (
          a.subjectCode === b.subjectCode &&
          a.groupCode === b.groupCode
        ) {
          continue;
        }
        if (!sameBlock(a.block, b.block)) continue;
        if (
          !dateRangesOverlap(a.startDate, a.endDate, b.startDate, b.endDate)
        ) {
          continue;
        }
        if (
          !timesOverlap(
            a.startMinutes,
            a.endMinutes,
            b.startMinutes,
            b.endMinutes
          )
        ) {
          continue;
        }
        issues.push({
          code: "schedule_conflict",
          severity: "warning",
          personId: a.personId,
          document: a.document,
          personName: a.personName ?? null,
          periodCode: a.periodCode,
          message: `Cruce de horario: ${a.subjectCode}/${a.groupCode} ↔ ${b.subjectCode}/${b.groupCode}`,
          detail: {
            a: {
              subject: a.subjectCode,
              group: a.groupCode,
              start: a.startMinutes,
              end: a.endMinutes,
              block: a.block,
            },
            b: {
              subject: b.subjectCode,
              group: b.groupCode,
              start: b.startMinutes,
              end: b.endMinutes,
              block: b.block,
            },
          },
        });
      }
    }
  }
  return issues;
}

export function findHoursBalanceIssues(
  rows: NormalizedAssignmentForValidation[],
  contexts: Map<number, PersonHoursContext>
): ImportValidationIssue[] {
  const byPerson = new Map<number, NormalizedAssignmentForValidation[]>();
  for (const r of rows) {
    const list = byPerson.get(r.personId) ?? [];
    list.push(r);
    byPerson.set(r.personId, list);
  }

  const issues: ImportValidationIssue[] = [];
  for (const [personId, personRows] of byPerson) {
    const ctx = contexts.get(personId);
    const sample = personRows[0];
    const catedraHours = personRows.reduce(
      (sum, r) => sum + (Number.isFinite(r.subjectHours) ? r.subjectHours : 0),
      0
    );
    const missingHours = personRows.filter(
      (r) => !Number.isFinite(r.subjectHours) || r.subjectHours <= 0
    );
    if (missingHours.length > 0) {
      issues.push({
        code: "missing_subject_hours",
        severity: "warning",
        personId,
        document: sample?.document,
        personName: sample?.personName ?? ctx?.fullName ?? null,
        message: `${missingHours.length} asignación(es) sin hours_quantity de materia (> 0)`,
        detail: {
          count: missingHours.length,
          samples: missingHours.slice(0, 5).map((r) => ({
            subject: r.subjectCode,
            group: r.groupCode,
            period: r.periodCode,
          })),
        },
      });
    }

    const contractHours = weeklyContractHoursFromLabels(
      ctx?.workSchedule,
      ctx?.contractName
    );
    if (contractHours == null) {
      issues.push({
        code: "missing_contract_hours",
        severity: "warning",
        personId,
        document: sample?.document ?? ctx?.document,
        personName: sample?.personName ?? ctx?.fullName ?? null,
        message:
          "No se pudo inferir jornada contractual (42/21); no se valida tope de horas",
        detail: {
          workSchedule: ctx?.workSchedule ?? null,
          contractName: ctx?.contractName ?? null,
        },
      });
      continue;
    }

    const preparationHours =
      ctx?.preparationHours ?? DEFAULT_CLASS_PREPARATION_HOURS;
    const substantiveAssigned = ctx?.substantiveAssigned ?? 0;
    const used = catedraHours + preparationHours + substantiveAssigned;
    const remaining = contractHours - used;

    if (remaining < 0) {
      issues.push({
        code: "hours_overload",
        severity: "warning",
        personId,
        document: sample?.document ?? ctx?.document,
        personName: sample?.personName ?? ctx?.fullName ?? null,
        message: `Sobrecarga horaria: usado ${used} > contrato ${contractHours} (restante ${remaining})`,
        detail: {
          contractHours,
          catedraHours,
          preparationHours,
          substantiveAssigned,
          used,
          remaining,
          assignments: personRows.length,
        },
      });
    }
  }
  return issues;
}

export function summarizeValidationIssues(issues: ImportValidationIssue[]): {
  total: number;
  by_code: Record<string, number>;
  warnings: number;
  errors: number;
} {
  const by_code: Record<string, number> = {};
  let warnings = 0;
  let errors = 0;
  for (const issue of issues) {
    by_code[issue.code] = (by_code[issue.code] ?? 0) + 1;
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { total: issues.length, by_code, warnings, errors };
}

export function findQuotaIssues(
  rows: NormalizedAssignmentForValidation[],
  contexts: Map<number, PersonHoursContext>
): ImportValidationIssue[] {
  const byPersonPeriod = new Map<string, NormalizedAssignmentForValidation[]>();
  for (const r of rows) {
    const key = `${r.personId}::${r.periodCode}`;
    const list = byPersonPeriod.get(key) ?? [];
    list.push(r);
    byPersonPeriod.set(key, list);
  }

  const issues: ImportValidationIssue[] = [];
  for (const group of byPersonPeriod.values()) {
    const sample = group[0];
    if (!sample) continue;
    const ctx = contexts.get(sample.personId);
    let creditsP = 0;
    let studentsV = 0;
    let hasP = false;
    let hasV = false;
    for (const r of group) {
      const kind = classifyGroupModality(r.modality);
      const credits = Number(r.creditsQuantity);
      const enrolled = Number(r.enrolledQuantity);
      if (kind === "P") {
        hasP = true;
        if (Number.isFinite(credits) && credits > 0) creditsP += credits;
      } else if (kind === "V") {
        hasV = true;
        if (Number.isFinite(enrolled) && enrolled > 0) studentsV += enrolled;
      }
    }

    const contractHours = weeklyContractHoursFromLabels(
      ctx?.workSchedule,
      ctx?.contractName
    );
    const quota = evaluateWorkloadQuota({
      contractHours,
      creditsP,
      studentsV,
      hasP,
      hasV,
    });
    if (quota.status !== "under" && quota.status !== "over") continue;

    const pct =
      quota.fulfillmentPct != null ? `${quota.fulfillmentPct}%` : "—";
    const modalityLabel = quota.modality ?? "sin modalidad";
    issues.push({
      code: quota.status === "under" ? "quota_under" : "quota_over",
      severity: "warning",
      personId: sample.personId,
      document: sample.document ?? ctx?.document,
      personName: sample.personName ?? ctx?.fullName ?? null,
      periodCode: sample.periodCode,
      message: quota.actionHint
        ? `${quota.actionHint} (${pct}, periodo ${sample.periodCode})`
        : quota.status === "under"
          ? `Cuota ${modalityLabel} incompleta (${pct}) en periodo ${sample.periodCode}`
          : `Cuota ${modalityLabel} excedida (${pct}) en periodo ${sample.periodCode}`,
      detail: {
        modality: quota.modality,
        periodCode: sample.periodCode,
        creditsP: quota.creditsP,
        studentsV: quota.studentsV,
        creditTarget: quota.creditTarget,
        studentTarget: quota.studentTarget,
        loadIndex: quota.loadIndex,
        fulfillmentPct: quota.fulfillmentPct,
        creditsGap: quota.creditsGap,
        studentsGap: quota.studentsGap,
        actionHint: quota.actionHint,
      },
    });
  }
  return issues;
}

export function runImportValidations(
  rows: NormalizedAssignmentForValidation[],
  contexts: Map<number, PersonHoursContext>
): ImportValidationIssue[] {
  return [
    ...findOverCapacityIssues(rows),
    ...findScheduleConflictIssues(rows),
    ...findHoursBalanceIssues(rows, contexts),
    ...findQuotaIssues(rows, contexts),
  ];
}
