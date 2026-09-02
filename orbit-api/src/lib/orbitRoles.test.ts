import assert from "node:assert/strict";
import {
  isNamedLiteOrLiderRole,
  sqlPersonIsFacultyRole,
  sqlSubstantiveHoursRoleFilter,
  sqlRoleIsLiteOrLider,
} from "./orbitRoles";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

test("isNamedLiteOrLiderRole matches catalog LITE/LIDER only", () => {
  assert.equal(isNamedLiteOrLiderRole({ roleName: "LITE" }), true);
  assert.equal(isNamedLiteOrLiderRole({ roleName: "LIDER" }), true);
  assert.equal(isNamedLiteOrLiderRole({ roleCode: "lite" }), true);
  assert.equal(isNamedLiteOrLiderRole({ roleName: "LIDER DE SERVICIO" }), false);
  assert.equal(isNamedLiteOrLiderRole({ roleName: "DOCENTE" }), false);
  assert.equal(
    isNamedLiteOrLiderRole({ roleName: "COODINADOR OPERATIVO ACADEMICO" }),
    false
  );
});

test("sqlRoleIsLiteOrLider uses name/code, not ORBIT_LITE_ROLE_ID", () => {
  const sql = sqlRoleIsLiteOrLider("r");
  assert.match(sql, /'LITE',\s*'LIDER'/);
  assert.doesNotMatch(sql, /role_id\s*=/);
});

test("sqlSubstantiveHoursRoleFilter buckets", () => {
  const docente = sqlSubstantiveHoursRoleFilter("r", "docente");
  const pensionado = sqlSubstantiveHoursRoleFilter("r", "docente_pensionado");
  const lite = sqlSubstantiveHoursRoleFilter("r", "lite");
  assert.match(docente, /= 'DOCENTE'/);
  assert.doesNotMatch(docente, /PENSIONAD/);
  assert.match(pensionado, /PENSIONAD/);
  assert.match(lite, /'LITE',\s*'LIDER'/);
});
