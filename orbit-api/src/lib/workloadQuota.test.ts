import assert from "node:assert/strict";
import {
  CREDIT_TARGET_FULL,
  CREDIT_TARGET_HALF,
  STUDENT_TARGET_FULL,
  STUDENT_TARGET_HALF,
  classifyGroupModality,
  evaluateWorkloadQuota,
  inferTeacherModality,
  quotaStatusFromLoadIndex,
  quotaTargetsFromContractHours,
} from "./workloadQuota";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

test("classifyGroupModality P/V", () => {
  assert.equal(classifyGroupModality("P"), "P");
  assert.equal(classifyGroupModality("Presencial"), "P");
  assert.equal(classifyGroupModality("V"), "V");
  assert.equal(classifyGroupModality("Virtual"), "V");
  assert.equal(classifyGroupModality("T"), "V");
  assert.equal(classifyGroupModality(""), null);
  assert.equal(classifyGroupModality("otra"), null);
});

test("inferTeacherModality", () => {
  assert.equal(inferTeacherModality(true, false), "presencial");
  assert.equal(inferTeacherModality(false, true), "virtual");
  assert.equal(inferTeacherModality(true, true), "mixto");
  assert.equal(inferTeacherModality(false, false), null);
});

test("quota targets from jornada", () => {
  assert.deepEqual(quotaTargetsFromContractHours(42), {
    creditTarget: CREDIT_TARGET_FULL,
    studentTarget: STUDENT_TARGET_FULL,
  });
  assert.deepEqual(quotaTargetsFromContractHours(21), {
    creditTarget: CREDIT_TARGET_HALF,
    studentTarget: STUDENT_TARGET_HALF,
  });
  assert.deepEqual(quotaTargetsFromContractHours(null), {
    creditTarget: null,
    studentTarget: null,
  });
});

test("presencial tiempo completo 28 créditos = ok", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 28,
    studentsV: 0,
    hasP: true,
    hasV: false,
  });
  assert.equal(r.modality, "presencial");
  assert.equal(r.status, "ok");
  assert.equal(r.fulfillmentPct, 100);
  assert.equal(r.creditsGap, 0);
  assert.equal(r.studentsGap, null);
});

test("presencial medio tiempo 14 créditos = ok", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 21,
    creditsP: 14,
    studentsV: 99,
    hasP: true,
    hasV: false,
  });
  assert.equal(r.status, "ok");
  assert.equal(r.creditTarget, 14);
  assert.equal(r.studentsGap, null);
});

test("presencial 14 de 28 = under", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 14,
    studentsV: 0,
    hasP: true,
    hasV: false,
  });
  assert.equal(r.status, "under");
  assert.equal(r.fulfillmentPct, 50);
  assert.equal(r.creditsGap, 14);
  assert.equal(
    r.actionHint,
    "Faltan 14 créditos presenciales"
  );
});

test("presencial 30 de 28 = over", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 30,
    studentsV: 0,
    hasP: true,
    hasV: false,
  });
  assert.equal(r.status, "over");
  assert.equal(r.creditsGap, -2);
});

test("virtual tiempo completo 500 estudiantes = ok", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 12,
    studentsV: 500,
    hasP: false,
    hasV: true,
  });
  assert.equal(r.modality, "virtual");
  assert.equal(r.status, "ok");
  assert.equal(r.creditsGap, null);
  assert.equal(r.studentsGap, 0);
});

test("virtual medio tiempo 250 = ok", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 21,
    creditsP: 0,
    studentsV: 250,
    hasP: false,
    hasV: true,
  });
  assert.equal(r.status, "ok");
  assert.equal(r.studentTarget, 250);
});

test("mixto proporcional 14 créditos + 250 estudiantes = 100%", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 14,
    studentsV: 250,
    hasP: true,
    hasV: true,
  });
  assert.equal(r.modality, "mixto");
  assert.equal(r.status, "ok");
  assert.equal(r.fulfillmentPct, 100);
  assert.equal(r.creditsGap, 0);
  assert.equal(r.studentsGap, 0);
  assert.equal(r.actionHint, null);
});

test("mixto medio tiempo 7 + 125 = 100%", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 21,
    creditsP: 7,
    studentsV: 125,
    hasP: true,
    hasV: true,
  });
  assert.equal(r.status, "ok");
  assert.equal(r.loadIndex, 1);
});

test("mixto 21 créditos + 100 estudiantes = 95% under", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 21,
    studentsV: 100,
    hasP: true,
    hasV: true,
  });
  assert.equal(r.status, "under");
  assert.equal(r.fulfillmentPct, 95);
  assert.equal(r.creditsGap, 1.4);
  assert.equal(r.studentsGap, 25);
  assert.equal(
    r.actionHint,
    "Faltan 1.4 créditos presenciales o 25 estudiantes virtuales"
  );
});

test("mixto 28 créditos + 100 estudiantes = over", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 28,
    studentsV: 100,
    hasP: true,
    hasV: true,
  });
  assert.equal(r.status, "over");
  assert.ok((r.loadIndex ?? 0) > 1);
  assert.equal(r.creditsGap, -5.6);
  assert.equal(r.studentsGap, -100);
  assert.equal(
    r.actionHint,
    "Exceso equivalente a 5.6 créditos presenciales o 100 estudiantes virtuales"
  );
});

test("sin jornada o sin carga = unknown", () => {
  assert.equal(
    evaluateWorkloadQuota({
      contractHours: null,
      creditsP: 28,
      studentsV: 0,
      hasP: true,
      hasV: false,
    }).status,
    "unknown"
  );
  assert.equal(
    evaluateWorkloadQuota({
      contractHours: 42,
      creditsP: 0,
      studentsV: 0,
      hasP: false,
      hasV: false,
    }).status,
    "unknown"
  );
});

test("tolerancia ±2%", () => {
  assert.equal(quotaStatusFromLoadIndex(0.99), "ok");
  assert.equal(quotaStatusFromLoadIndex(1.01), "ok");
  assert.equal(quotaStatusFromLoadIndex(0.97), "under");
  assert.equal(quotaStatusFromLoadIndex(1.03), "over");
  assert.equal(quotaStatusFromLoadIndex(null), "unknown");
});

test("hasP true con 0 créditos sigue siendo presencial", () => {
  const r = evaluateWorkloadQuota({
    contractHours: 42,
    creditsP: 0,
    studentsV: 0,
    hasP: true,
    hasV: false,
  });
  assert.equal(r.modality, "presencial");
  assert.equal(r.status, "under");
  assert.equal(r.fulfillmentPct, 0);
});

console.log("workloadQuota tests passed");
