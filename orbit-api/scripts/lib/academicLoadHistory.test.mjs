/**
 * Unit tests for academic load history helpers (no DB).
 */
import assert from "assert";
import {
  checkCircuitBreaker,
  computeRowHash,
  CIRCUIT_BREAKER_RATIO,
} from "./academicLoadHistory.mjs";

assert.strictEqual(checkCircuitBreaker(100, null).ok, true);
assert.strictEqual(checkCircuitBreaker(100, 0).ok, true);
assert.strictEqual(checkCircuitBreaker(100, 100).ok, true);
assert.strictEqual(checkCircuitBreaker(130, 100).ok, true);
assert.strictEqual(checkCircuitBreaker(131, 100).ok, false);
assert.strictEqual(checkCircuitBreaker(69, 100).ok, false);
assert.strictEqual(CIRCUIT_BREAKER_RATIO, 0.3);

const base = {
  period_code: "26C11",
  subject_code: "MAT101",
  group_code: "01",
  person_id: 42,
  aca_group_id: "G1",
  semester: null,
  program_id: null,
  program_name: "Ing",
  enrolled_quantity: 20,
  substantive_hours_quantity: 4,
  region_id: null,
  city_id: null,
  campus_id: null,
  class_preparation_id: null,
};
const a = computeRowHash(base);
const b = computeRowHash({ ...base });
assert.ok(Buffer.isBuffer(a) && a.length === 32 && a.equals(b));
assert.ok(!a.equals(computeRowHash({ ...base, enrolled_quantity: 21 })));

console.log("academicLoadHistory tests ok");
