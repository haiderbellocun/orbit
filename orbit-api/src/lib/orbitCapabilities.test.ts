import assert from "node:assert/strict";
import {
  ALL_ORBIT_CAPABILITIES,
  ORBIT_CAPABILITY,
  ROLE_9_OPERATIONS_CAPABILITIES,
  SCHOOL_COORDINATOR_ROLE_IDS,
  VACANCIES_ONLY_CAPABILITIES,
  resolveOrbitAccess,
} from "./orbitCapabilities";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

const fullIds = [1, 10, 13, 19, 42, 43, 44, 45, 46];

for (const id of fullIds) {
  test(`full access role ${id}`, () => {
    const r = resolveOrbitAccess({
      roleId: id,
      roleCode: null,
      roleName: null,
    });
    assert.ok(r);
    assert.equal(r.orbitAccess, "full");
    assert.deepEqual(r.capabilities, [...ALL_ORBIT_CAPABILITIES]);
  });
}

test("role 9 all panels + full data scope (not LITE login)", () => {
  const prev = process.env.ORBIT_LITE_ROLE_ID;
  process.env.ORBIT_LITE_ROLE_ID = "9";
  try {
    const r = resolveOrbitAccess({
      roleId: 9,
      roleCode: null,
      roleName: null,
    });
    assert.ok(r);
    assert.equal(r.orbitAccess, "full");
    assert.deepEqual(r.capabilities, [...ALL_ORBIT_CAPABILITIES]);
    assert.deepEqual(r.capabilities, [...ROLE_9_OPERATIONS_CAPABILITIES]);
    assert.equal(r.capabilities.includes(ORBIT_CAPABILITY.HOME), true);
  } finally {
    if (prev === undefined) delete process.env.ORBIT_LITE_ROLE_ID;
    else process.env.ORBIT_LITE_ROLE_ID = prev;
  }
});

for (const id of SCHOOL_COORDINATOR_ROLE_IDS) {
  test(`school coordinator role ${id}`, () => {
    const r = resolveOrbitAccess({
      roleId: id,
      roleCode: null,
      roleName: null,
    });
    assert.ok(r);
    assert.equal(r.orbitAccess, "school");
    assert.deepEqual(r.capabilities, [...ALL_ORBIT_CAPABILITIES]);
  });
}

for (const id of [37, 38]) {
  test(`role ${id} vacancies only`, () => {
    const r = resolveOrbitAccess({
      roleId: id,
      roleCode: null,
      roleName: null,
    });
    assert.ok(r);
    assert.equal(r.orbitAccess, "full");
    assert.deepEqual(r.capabilities, [...VACANCIES_ONLY_CAPABILITIES]);
    assert.equal(r.capabilities.includes(ORBIT_CAPABILITY.HOME), false);
  });
}

test("LITE by configured role id (not 9)", () => {
  const prev = process.env.ORBIT_LITE_ROLE_ID;
  process.env.ORBIT_LITE_ROLE_ID = "12";
  try {
    const r = resolveOrbitAccess({
      roleId: 12,
      roleCode: null,
      roleName: null,
    });
    assert.ok(r);
    assert.equal(r.orbitAccess, "lite");
    assert.deepEqual(r.capabilities, [
      ORBIT_CAPABILITY.HOME,
      ORBIT_CAPABILITY.TEACHERS,
    ]);
  } finally {
    if (prev === undefined) delete process.env.ORBIT_LITE_ROLE_ID;
    else process.env.ORBIT_LITE_ROLE_ID = prev;
  }
});

test("LITE by name", () => {
  const r = resolveOrbitAccess({
    roleId: 999,
    roleCode: "LITE",
    roleName: null,
  });
  assert.ok(r);
  assert.equal(r.orbitAccess, "lite");
});

test("coordinator name without whitelisted id is denied", () => {
  const r = resolveOrbitAccess({
    roleId: 20,
    roleCode: "COORDINADOR_ACADEMICO",
    roleName: "COORDINADOR DE PROGRAMA",
  });
  assert.equal(r, null);
});

test("unknown role is denied", () => {
  const r = resolveOrbitAccess({
    roleId: 999,
    roleCode: "OTRO",
    roleName: "OTRO ROL",
  });
  assert.equal(r, null);
});

console.log("orbitCapabilities tests passed");
