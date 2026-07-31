import assert from "node:assert/strict";
import {
  dateRangesOverlap,
  findHoursBalanceIssues,
  findOverCapacityIssues,
  findScheduleConflictIssues,
  parseTimeToMinutes,
  runImportValidations,
  summarizeValidationIssues,
  timesOverlap,
} from "./academicLoadValidation";
import { weeklyContractHoursFromLabels } from "./substantiveHours";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

test("parseTimeToMinutes 24h and am/pm", () => {
  assert.equal(parseTimeToMinutes("18:00"), 18 * 60);
  assert.equal(parseTimeToMinutes("6:30 PM"), 18 * 60 + 30);
  assert.equal(parseTimeToMinutes("12:00 AM"), 0);
  assert.equal(parseTimeToMinutes("bad"), null);
});

test("timesOverlap half-open intervals", () => {
  assert.equal(timesOverlap(600, 720, 700, 800), true);
  assert.equal(timesOverlap(600, 700, 700, 800), false);
  assert.equal(timesOverlap(null, 700, 600, 800), false);
});

test("dateRangesOverlap defaults", () => {
  assert.equal(dateRangesOverlap(null, null, null, null), true);
  assert.equal(
    dateRangesOverlap("2026-01-01", "2026-03-01", "2026-04-01", "2026-06-01"),
    false
  );
  assert.equal(
    dateRangesOverlap("2026-01-01", "2026-05-01", "2026-04-01", "2026-06-01"),
    true
  );
});

test("over_capacity", () => {
  const issues = findOverCapacityIssues([
    {
      index: 0,
      personId: 1,
      document: "1",
      periodCode: "26C11",
      subjectCode: "A",
      groupCode: "01",
      subjectHours: 4,
      enrolledQuantity: 45,
      capacity: 40,
      startDate: null,
      endDate: null,
      startMinutes: null,
      endMinutes: null,
      block: null,
    },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "over_capacity");
});

test("schedule_conflict same block overlapping times", () => {
  const base = {
    personId: 9,
    document: "99",
    periodCode: "26C11",
    subjectHours: 4,
    enrolledQuantity: 10,
    capacity: 40,
    startDate: "2026-02-01",
    endDate: "2026-05-01",
    block: "Noche",
  };
  const issues = findScheduleConflictIssues([
    {
      ...base,
      index: 0,
      subjectCode: "MAT",
      groupCode: "01",
      startMinutes: 18 * 60,
      endMinutes: 20 * 60,
    },
    {
      ...base,
      index: 1,
      subjectCode: "FIS",
      groupCode: "02",
      startMinutes: 19 * 60,
      endMinutes: 21 * 60,
    },
  ]);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].code, "schedule_conflict");
});

test("hours_overload uses contract - catedra - prep - substantive", () => {
  assert.equal(
    weeklyContractHoursFromLabels("Tiempo completo", null),
    42
  );
  const contexts = new Map([
    [
      1,
      {
        personId: 1,
        preparationHours: 4,
        substantiveAssigned: 10,
        workSchedule: "Tiempo completo",
        contractName: "Docente",
      },
    ],
  ]);
  const issues = findHoursBalanceIssues(
    [
      {
        index: 0,
        personId: 1,
        document: "1",
        periodCode: "26C11",
        subjectCode: "A",
        groupCode: "01",
        subjectHours: 20,
        enrolledQuantity: 10,
        capacity: 40,
        startDate: null,
        endDate: null,
        startMinutes: null,
        endMinutes: null,
        block: null,
      },
      {
        index: 1,
        personId: 1,
        document: "1",
        periodCode: "26C11",
        subjectCode: "B",
        groupCode: "01",
        subjectHours: 12,
        enrolledQuantity: 10,
        capacity: 40,
        startDate: null,
        endDate: null,
        startMinutes: null,
        endMinutes: null,
        block: null,
      },
    ],
    contexts
  );
  // 20+12 + 4 + 10 = 46 > 42
  const overload = issues.find((i) => i.code === "hours_overload");
  assert.ok(overload);
  assert.equal((overload!.detail as { remaining: number }).remaining, -4);
});

test("runImportValidations + summarize", () => {
  const issues = runImportValidations([], new Map());
  const summary = summarizeValidationIssues(issues);
  assert.equal(summary.total, 0);
});

console.log("academicLoadValidation tests passed");
