import assert from "node:assert/strict";
import {
  canHaveDirectReports,
  getRoleBand,
  getRoleHierarchyLevel,
  ROLE_HIERARCHY_LEVEL,
} from "./roleHierarchy";
import {
  isSelfManager,
  managerAssignmentCreatesCycle,
} from "./personManager";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

test("role hierarchy coordinador / jefatura / jefe", () => {
  assert.equal(getRoleBand({ roleName: "Coordinador Académico" }), "coordinator");
  assert.equal(getRoleBand({ roleName: "COORDINADOR DE PROGRAMA" }), "coordinator");
  assert.equal(getRoleBand({ roleName: "Jefatura" }), "coordinator");
  assert.equal(getRoleBand({ roleName: "JEFE" }), "coordinator");
  assert.equal(
    getRoleHierarchyLevel({ roleName: "Coordinadora" }),
    ROLE_HIERARCHY_LEVEL.COORDINATOR
  );
});

test("role hierarchy líder / lite", () => {
  assert.equal(getRoleBand({ roleName: "LÍDER" }), "leader");
  assert.equal(getRoleBand({ roleName: "Lider Académico" }), "leader");
  assert.equal(getRoleBand({ roleName: "LITE" }), "leader");
  assert.equal(getRoleBand({ roleCode: "LITE" }), "leader");
  assert.equal(canHaveDirectReports({ roleName: "LITE" }), true);
  assert.equal(canHaveDirectReports({ roleName: "Coordinador" }), true);
});

test("role hierarchy docentes y desconocidos", () => {
  assert.equal(getRoleBand({ roleName: "DOCENTE" }), "faculty");
  assert.equal(getRoleBand({ roleName: "DOCENTES PENSIONADOS" }), "faculty");
  assert.equal(getRoleBand({ roleName: "Analista de datos" }), "analyst");
  assert.equal(getRoleBand({ roleName: "Cargo inventado XYZ" }), "other");
  assert.equal(getRoleHierarchyLevel({ roleName: null }), ROLE_HIERARCHY_LEVEL.OTHER);
  assert.equal(canHaveDirectReports({ roleName: "DOCENTE" }), false);
});

test("manager cycle detection", () => {
  const chain = new Map<number, number | null>([
    [1, null],
    [2, 1],
    [3, 2],
  ]);
  assert.equal(isSelfManager(2, 2), true);
  assert.equal(managerAssignmentCreatesCycle(2, 2, chain), true);
  assert.equal(managerAssignmentCreatesCycle(1, 3, chain), true);
  assert.equal(managerAssignmentCreatesCycle(3, 1, chain), false);
  assert.equal(managerAssignmentCreatesCycle(3, null, chain), false);
  assert.equal(managerAssignmentCreatesCycle(4, 1, chain), false);
});
