/**
 * Validaciones de negocio para import de carga académica (ACA → Orbit).
 * Mirror de src/lib/academicLoadValidation.ts + substantiveHours contract labels.
 */

export const DEFAULT_CLASS_PREPARATION_HOURS = 4;

export function weeklyContractHoursFromLabels(workSchedule, contractName) {
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

export function parseTimeToMinutes(value) {
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

export function dateRangesOverlap(aStart, aEnd, bStart, bEnd) {
  if (!aStart && !aEnd && !bStart && !bEnd) return true;
  const as = aStart ?? "0001-01-01";
  const ae = aEnd ?? "9999-12-31";
  const bs = bStart ?? "0001-01-01";
  const be = bEnd ?? "9999-12-31";
  return as <= be && bs <= ae;
}

export function timesOverlap(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) {
    return false;
  }
  if (aEnd <= aStart || bEnd <= bStart) return false;
  return aStart < bEnd && bStart < aEnd;
}

function sameBlock(a, b) {
  const na = (a ?? "").trim().toLowerCase();
  const nb = (b ?? "").trim().toLowerCase();
  if (!na || !nb) return true;
  return na === nb;
}

export function findOverCapacityIssues(rows) {
  const issues = [];
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

export function findScheduleConflictIssues(rows) {
  const byPersonPeriod = new Map();
  for (const r of rows) {
    const key = `${r.personId}::${r.periodCode}`;
    const list = byPersonPeriod.get(key) ?? [];
    list.push(r);
    byPersonPeriod.set(key, list);
  }

  const issues = [];
  for (const group of byPersonPeriod.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.subjectCode === b.subjectCode && a.groupCode === b.groupCode) {
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

export function findHoursBalanceIssues(rows, contexts) {
  const byPerson = new Map();
  for (const r of rows) {
    const list = byPerson.get(r.personId) ?? [];
    list.push(r);
    byPerson.set(r.personId, list);
  }

  const issues = [];
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

export function findQuotaIssues(rows, contexts) {
  const byPersonPeriod = new Map();
  for (const r of rows) {
    const key = `${r.personId}::${r.periodCode}`;
    const list = byPersonPeriod.get(key) ?? [];
    list.push(r);
    byPersonPeriod.set(key, list);
  }

  const CREDIT_FULL = 28;
  const CREDIT_HALF = 14;
  const STUDENT_FULL = 500;
  const STUDENT_HALF = 250;
  const TOL = 0.02;

  const classify = (raw) => {
    const s = String(raw ?? "").trim();
    if (!s) return null;
    const ascii = s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase();
    if (ascii === "V" || ascii === "T" || ascii === "VIRTUAL" || ascii.startsWith("VIR")) {
      return "V";
    }
    if (ascii === "P" || ascii === "PRESENCIAL" || ascii.startsWith("PRES")) {
      return "P";
    }
    return null;
  };

  const issues = [];
  for (const group of byPersonPeriod.values()) {
    const sample = group[0];
    if (!sample) continue;
    const ctx = contexts.get(sample.personId);
    let creditsP = 0;
    let studentsV = 0;
    let hasP = false;
    let hasV = false;
    for (const r of group) {
      const kind = classify(r.modality);
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
    const creditTarget =
      contractHours === 42 ? CREDIT_FULL : contractHours === 21 ? CREDIT_HALF : null;
    const studentTarget =
      contractHours === 42 ? STUDENT_FULL : contractHours === 21 ? STUDENT_HALF : null;
    const modality =
      hasP && hasV ? "mixto" : hasP ? "presencial" : hasV ? "virtual" : null;
    if (!modality || creditTarget == null || studentTarget == null) continue;

    let loadIndex = 0;
    if (modality === "presencial") loadIndex = creditsP / creditTarget;
    else if (modality === "virtual") loadIndex = studentsV / studentTarget;
    else loadIndex = creditsP / creditTarget + studentsV / studentTarget;

    let status = "ok";
    if (loadIndex < 1 - TOL) status = "under";
    else if (loadIndex > 1 + TOL) status = "over";
    if (status !== "under" && status !== "over") continue;

    const fulfillmentPct = Math.round(loadIndex * 1000) / 10;
    issues.push({
      code: status === "under" ? "quota_under" : "quota_over",
      severity: "warning",
      personId: sample.personId,
      document: sample.document ?? ctx?.document,
      personName: sample.personName ?? ctx?.fullName ?? null,
      periodCode: sample.periodCode,
      message:
        status === "under"
          ? `Cuota ${modality} incompleta (${fulfillmentPct}%) en periodo ${sample.periodCode}`
          : `Cuota ${modality} excedida (${fulfillmentPct}%) en periodo ${sample.periodCode}`,
      detail: {
        modality,
        periodCode: sample.periodCode,
        creditsP,
        studentsV,
        creditTarget,
        studentTarget,
        loadIndex,
        fulfillmentPct,
      },
    });
  }
  return issues;
}

export function summarizeValidationIssues(issues) {
  const by_code = {};
  let warnings = 0;
  let errors = 0;
  for (const issue of issues) {
    by_code[issue.code] = (by_code[issue.code] ?? 0) + 1;
    if (issue.severity === "error") errors += 1;
    else warnings += 1;
  }
  return { total: issues.length, by_code, warnings, errors };
}

export function runImportValidations(rows, contexts) {
  return [
    ...findOverCapacityIssues(rows),
    ...findScheduleConflictIssues(rows),
    ...findHoursBalanceIssues(rows, contexts),
    ...findQuotaIssues(rows, contexts),
  ];
}
