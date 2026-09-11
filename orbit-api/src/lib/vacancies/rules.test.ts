import assert from "node:assert/strict";
import {
  CLOSE_STATUSES,
  FULLY_LOCKED_STATUSES,
  hiredQuantityRangeError,
  isConfirmTextValid,
  isUuid,
  numOrUndef,
  OPERATION_STATUSES,
  parseOptionalBool,
  REQUISITION_BLOCKED_STATUSES,
  resolveHiredQuantityForHired,
  vacancyChangeLogActionLabel,
} from "./rules";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

test("estados: cierre y bloqueo son subconjuntos de los válidos", () => {
  for (const s of CLOSE_STATUSES) assert.ok(OPERATION_STATUSES.has(s));
  for (const s of FULLY_LOCKED_STATUSES) assert.ok(OPERATION_STATUSES.has(s));
  for (const s of REQUISITION_BLOCKED_STATUSES) assert.ok(OPERATION_STATUSES.has(s));
});

test("la requisición sigue editable en hired, pero la vacante no", () => {
  assert.ok(FULLY_LOCKED_STATUSES.has("hired"));
  assert.ok(!REQUISITION_BLOCKED_STATUSES.has("hired"));
});

test("isConfirmTextValid acepta CONFIRMAR sin distinguir mayúsculas ni espacios", () => {
  assert.equal(isConfirmTextValid("CONFIRMAR"), true);
  assert.equal(isConfirmTextValid("  confirmar  "), true);
  assert.equal(isConfirmTextValid("Confirmar"), true);
  assert.equal(isConfirmTextValid("confirma"), false);
  assert.equal(isConfirmTextValid(""), false);
  assert.equal(isConfirmTextValid(null), false);
  assert.equal(isConfirmTextValid(123), false);
});

test("isUuid", () => {
  assert.equal(isUuid("3f2504e0-4f89-41d3-9a0c-0305e82c3301"), true);
  assert.equal(isUuid("3F2504E0-4F89-41D3-9A0C-0305E82C3301"), true);
  assert.equal(isUuid("123"), false);
  assert.equal(isUuid("no-es-uuid"), false);
});

test("parseOptionalBool solo acepta booleanos reales", () => {
  assert.equal(parseOptionalBool(true), true);
  assert.equal(parseOptionalBool(false), false);
  assert.equal(parseOptionalBool(undefined), null);
  assert.equal(parseOptionalBool(null), null);
  assert.equal(parseOptionalBool("true"), null);
  assert.equal(parseOptionalBool(1), null);
});

test("numOrUndef", () => {
  assert.equal(numOrUndef(5), 5);
  assert.equal(numOrUndef("5"), 5);
  assert.equal(numOrUndef(0), 0);
  assert.equal(numOrUndef(undefined), undefined);
  assert.equal(numOrUndef(null), undefined);
  assert.equal(numOrUndef("abc"), undefined);
});

test("hiredQuantityRangeError", () => {
  assert.equal(hiredQuantityRangeError(0, 3), null);
  assert.equal(hiredQuantityRangeError(3, 3), null);
  assert.ok(hiredQuantityRangeError(-1, 3));
  assert.ok(hiredQuantityRangeError(4, 3));
  assert.ok(hiredQuantityRangeError(Number.NaN, 3));
});

test("contratar exige declarar cuántas personas se contrataron", () => {
  const r = resolveHiredQuantityForHired({
    incoming: undefined,
    previousStatus: "open",
    currentHired: 0,
    currentQuantity: 3,
  });
  assert.equal(r.ok, false);
});

test("una vacante ya contratada conserva su cantidad si no llega una nueva", () => {
  const r = resolveHiredQuantityForHired({
    incoming: undefined,
    previousStatus: "hired",
    currentHired: 2,
    currentQuantity: 3,
  });
  assert.deepEqual(r, { ok: true, value: 2 });
});

test("sin contratados previos no hay cantidad que conservar", () => {
  const r = resolveHiredQuantityForHired({
    incoming: undefined,
    previousStatus: "hired",
    currentHired: 0,
    currentQuantity: 3,
  });
  assert.equal(r.ok, false);
});

test("la cantidad contratada debe ser al menos 1 y caber en la solicitada", () => {
  assert.equal(
    resolveHiredQuantityForHired({
      incoming: 0,
      previousStatus: "open",
      currentHired: 0,
      currentQuantity: 3,
    }).ok,
    false
  );
  assert.equal(
    resolveHiredQuantityForHired({
      incoming: 4,
      previousStatus: "open",
      currentHired: 0,
      currentQuantity: 3,
    }).ok,
    false
  );
  assert.deepEqual(
    resolveHiredQuantityForHired({
      incoming: 3,
      previousStatus: "open",
      currentHired: 0,
      currentQuantity: 3,
    }),
    { ok: true, value: 3 }
  );
});

test("vacancyChangeLogActionLabel prioriza el cambio de estado admin", () => {
  assert.equal(
    vacancyChangeLogActionLabel("UPDATE", { actionType: "admin_status_change" }),
    "Cambio de estado (admin)"
  );
  assert.equal(vacancyChangeLogActionLabel("DELETE", {}), "Eliminación total");
  assert.equal(vacancyChangeLogActionLabel("INSERT", {}), "Creación de vacante");
  assert.equal(
    vacancyChangeLogActionLabel("UPDATE", { requisitionPatch: {} }),
    "Actualización de requisición"
  );
  assert.equal(
    vacancyChangeLogActionLabel("UPDATE", { operationNoteAppended: true }),
    "Comentario de operación"
  );
  assert.equal(
    vacancyChangeLogActionLabel("UPDATE", { operationStatus: "closed" }),
    "Cambio de estado"
  );
  assert.equal(
    vacancyChangeLogActionLabel("UPDATE", {}),
    "Actualización de vacante"
  );
  assert.equal(vacancyChangeLogActionLabel("OTRA", {}), "Registro de actividad");
});

console.log("vacancies rules tests passed");
