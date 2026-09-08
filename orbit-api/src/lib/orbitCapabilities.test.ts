import assert from "node:assert/strict";
import {
  ALL_ORBIT_CAPABILITIES,
  ORBIT_CAPABILITY,
  ROLE_51_STAFF_CAPABILITIES,
  ROLE_51_STAFF_ROLE_ID,
  ROLE_9_OPERATIONS_CAPABILITIES,
  SCHOOL_COORDINATOR_ROLE_IDS,
  SUPER_ADMIN_CAPABILITIES,
  VACANCIES_ADMIN_CAPABILITIES,
  ROLE_37_VACANCIES_CAPABILITIES,
  VACANCIES_ONLY_CAPABILITIES,
  isEmailAuthorizedForOrbit,
  isEmailOnOrbitAllowlist,
  isEmailVacancyAdmin,
  canVacancyAdmin,
  ensureVacancyAdminCapabilities,
  resolveAllowlistAdminAccess,
  resolveOrbitAccess,
  resolvePlantaActivaGrantAccess,
} from "./orbitCapabilities";
import {
  canEditPlantaArea,
  canEditPlantaPerson,
  canViewPlantaArea,
  getPlantaActivaGrant,
} from "./plantaActivaAccess";

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

test("role 51 vacancies + news school scope", () => {
  const r = resolveOrbitAccess({
    roleId: ROLE_51_STAFF_ROLE_ID,
    roleCode: null,
    roleName: null,
  });
  assert.ok(r);
  assert.equal(r.orbitAccess, "school");
  assert.deepEqual(r.capabilities, [...ROLE_51_STAFF_CAPABILITIES]);
  assert.equal(r.capabilities.includes(ORBIT_CAPABILITY.NEWS), true);
  assert.equal(r.capabilities.includes(ORBIT_CAPABILITY.VACANCIES), true);
  assert.equal(r.capabilities.includes(ORBIT_CAPABILITY.HOME), false);
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

test("role 37 vacancies + informative panel", () => {
  const r = resolveOrbitAccess({
    roleId: 37,
    roleCode: null,
    roleName: null,
  });
  assert.ok(r);
  assert.equal(r.orbitAccess, "full");
  assert.deepEqual(r.capabilities, [...ROLE_37_VACANCIES_CAPABILITIES]);
  assert.equal(
    r.capabilities.includes(ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL),
    true
  );
  assert.equal(r.capabilities.includes(ORBIT_CAPABILITY.VACANCIES_ADMIN), false);
});

test("VACANCIES_ONLY_CAPABILITIES unchanged (vacancies list only)", () => {
  assert.deepEqual(VACANCIES_ONLY_CAPABILITIES, [ORBIT_CAPABILITY.VACANCIES]);
});

test("role 38 vacancies + admin", () => {
  const r = resolveOrbitAccess({
    roleId: 38,
    roleCode: null,
    roleName: null,
  });
  assert.ok(r);
  assert.equal(r.orbitAccess, "full");
  assert.deepEqual(r.capabilities, [...VACANCIES_ADMIN_CAPABILITIES]);
  assert.equal(r.capabilities.includes(ORBIT_CAPABILITY.VACANCIES_ADMIN), true);
});

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

test("allowlist default includes camilo, haider, raul and zuany", () => {
  const prev = process.env.ORBIT_ACCESS_ALLOWLIST;
  delete process.env.ORBIT_ACCESS_ALLOWLIST;
  try {
    assert.equal(isEmailOnOrbitAllowlist("camilo_quintero@cun.edu.co"), true);
    assert.equal(isEmailOnOrbitAllowlist("CAMILO_QUINTERO@cun.edu.co"), true);
    assert.equal(isEmailOnOrbitAllowlist("haider_bello@cun.edu.co"), true);
    assert.equal(isEmailOnOrbitAllowlist("raul_valencia@cun.edu.co"), true);
    assert.equal(isEmailOnOrbitAllowlist("zuany_acuna@cun.edu.co"), true);
    assert.equal(isEmailOnOrbitAllowlist("otro@cun.edu.co"), false);
    const admin = resolveAllowlistAdminAccess();
    assert.equal(admin.orbitAccess, "full");
    assert.deepEqual(admin.capabilities, [...SUPER_ADMIN_CAPABILITIES]);
    assert.equal(admin.capabilities.includes(ORBIT_CAPABILITY.PLANTA_ACTIVA), true);
    assert.equal(admin.capabilities.includes(ORBIT_CAPABILITY.VACANCIES_ADMIN), true);
  } finally {
    if (prev === undefined) delete process.env.ORBIT_ACCESS_ALLOWLIST;
    else process.env.ORBIT_ACCESS_ALLOWLIST = prev;
  }
});

test("allowlist env override", () => {
  const prev = process.env.ORBIT_ACCESS_ALLOWLIST;
  process.env.ORBIT_ACCESS_ALLOWLIST = "a@cun.edu.co, b@cun.edu.co";
  try {
    assert.equal(isEmailOnOrbitAllowlist("a@cun.edu.co"), true);
    assert.equal(isEmailOnOrbitAllowlist("b@cun.edu.co"), true);
    assert.equal(isEmailOnOrbitAllowlist("camilo_quintero@cun.edu.co"), false);
  } finally {
    if (prev === undefined) delete process.env.ORBIT_ACCESS_ALLOWLIST;
    else process.env.ORBIT_ACCESS_ALLOWLIST = prev;
  }
});

test("vacancy admin allowlist: camilo, yesid, sara, cindy", () => {
  const prev = process.env.ORBIT_VACANCY_ADMIN_ALLOWLIST;
  delete process.env.ORBIT_VACANCY_ADMIN_ALLOWLIST;
  try {
    assert.equal(isEmailVacancyAdmin("camilo_quintero@cun.edu.co"), true);
    assert.equal(isEmailVacancyAdmin("yesid_rocha@cun.edu.co"), true);
    assert.equal(isEmailVacancyAdmin("sara_murillofo@cun.edu.co"), true);
    assert.equal(isEmailVacancyAdmin("cindy_russi@cun.edu.co"), true);
    assert.equal(isEmailVacancyAdmin("otro@cun.edu.co"), false);
    assert.equal(isEmailAuthorizedForOrbit("yesid_rocha@cun.edu.co"), true);
    assert.equal(
      canVacancyAdmin([], "yesid_rocha@cun.edu.co"),
      true
    );
    assert.equal(
      canVacancyAdmin([ORBIT_CAPABILITY.VACANCIES_ADMIN], "otro@cun.edu.co"),
      true
    );
    const caps = ensureVacancyAdminCapabilities(
      [ORBIT_CAPABILITY.HOME],
      "yesid_rocha@cun.edu.co"
    );
    assert.equal(caps.includes(ORBIT_CAPABILITY.VACANCIES), true);
    assert.equal(caps.includes(ORBIT_CAPABILITY.VACANCIES_ADMIN), true);
  } finally {
    if (prev === undefined) delete process.env.ORBIT_VACANCY_ADMIN_ALLOWLIST;
    else process.env.ORBIT_VACANCY_ADMIN_ALLOWLIST = prev;
  }
});

test("planta activa grants: sara/cindy/leidy/tania", () => {
  const sara = getPlantaActivaGrant("sara_murillofo@cun.edu.co");
  assert.ok(sara);
  assert.equal(sara!.viewAreaIds, null);
  assert.deepEqual(sara!.editAreaIds, [2, 3, 4, 5, 6, 7, 8]);
  assert.equal(sara!.excludeLiteAndDocenteRoles, undefined);
  assert.deepEqual(sara!.extraCapabilities, [
    "view:home",
    "view:vacancies",
    "vacancies:informative_panel",
    "vacancies:admin",
    "view:news",
  ]);
  assert.equal(canViewPlantaArea(sara, 1), true);
  assert.equal(canViewPlantaArea(sara, 9), true);
  assert.equal(canEditPlantaArea(sara, 1), false);
  assert.equal(canEditPlantaArea(sara, 3), true);
  assert.equal(
    canEditPlantaPerson(sara, 3, { roleName: "COORDINADOR DE PROGRAMA" }),
    true
  );
  assert.equal(canEditPlantaPerson(sara, 9, { roleName: "DOCENTE" }), false);
  assert.equal(canEditPlantaPerson(sara, 1, { roleName: "LITE" }), false);
  const saraAccess = resolvePlantaActivaGrantAccess(sara);
  assert.equal(saraAccess.capabilities.includes(ORBIT_CAPABILITY.PLANTA_ACTIVA), true);
  assert.equal(saraAccess.capabilities.includes(ORBIT_CAPABILITY.HOME), true);
  assert.equal(saraAccess.capabilities.includes(ORBIT_CAPABILITY.VACANCIES), true);
  assert.equal(
    saraAccess.capabilities.includes(ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL),
    true
  );
  assert.equal(saraAccess.capabilities.includes(ORBIT_CAPABILITY.NEWS), true);
  assert.equal(
    saraAccess.capabilities.includes(ORBIT_CAPABILITY.VACANCIES_ADMIN),
    true
  );

  const cindy = getPlantaActivaGrant("cindy_russi@cun.edu.co");
  assert.ok(cindy);
  assert.deepEqual(cindy!.viewAreaIds, sara!.viewAreaIds);
  assert.deepEqual(cindy!.editAreaIds, sara!.editAreaIds);
  assert.deepEqual(cindy!.extraCapabilities, sara!.extraCapabilities);
  const cindyAccess = resolvePlantaActivaGrantAccess(cindy);
  assert.deepEqual(cindyAccess, saraAccess);

  const leidy = getPlantaActivaGrant("LEIDY_BERNAL@cun.edu.co");
  assert.ok(leidy);
  assert.deepEqual(leidy!.viewAreaIds, [1]);
  assert.deepEqual(leidy!.extraCapabilities, [
    "view:academic_load",
    "view:news",
  ]);
  assert.equal(canViewPlantaArea(leidy, 1), true);
  assert.equal(canViewPlantaArea(leidy, 2), false);
  assert.equal(canEditPlantaArea(leidy, 1), true);
  assert.equal(canEditPlantaArea(leidy, 2), false);
  assert.equal(
    resolvePlantaActivaGrantAccess(leidy).capabilities.includes(
      ORBIT_CAPABILITY.ACADEMIC_LOAD
    ),
    true
  );
  assert.equal(
    resolvePlantaActivaGrantAccess(leidy).capabilities.includes(
      ORBIT_CAPABILITY.NEWS
    ),
    true
  );

  const carlos = getPlantaActivaGrant("carlos_rodriguezs@cun.edu.co");
  assert.ok(carlos);
  assert.deepEqual(
    { viewAreaIds: carlos!.viewAreaIds, editAreaIds: carlos!.editAreaIds, extraCapabilities: carlos!.extraCapabilities },
    { viewAreaIds: leidy!.viewAreaIds, editAreaIds: leidy!.editAreaIds, extraCapabilities: leidy!.extraCapabilities }
  );

  const tania = getPlantaActivaGrant("tania_rocha@cun.edu.co");
  assert.ok(tania);
  assert.deepEqual(tania!.viewAreaIds, [9]);
  assert.deepEqual(tania!.extraCapabilities, [
    "view:academic_load",
    "view:news",
  ]);
  assert.equal(canViewPlantaArea(tania, 9), true);
  assert.equal(canViewPlantaArea(tania, 2), false);
  assert.equal(canEditPlantaArea(tania, 9), true);
  assert.equal(canEditPlantaArea(tania, 1), false);
  assert.equal(
    resolvePlantaActivaGrantAccess(tania).capabilities.includes(
      ORBIT_CAPABILITY.ACADEMIC_LOAD
    ),
    true
  );
  assert.equal(
    resolvePlantaActivaGrantAccess(tania).capabilities.includes(
      ORBIT_CAPABILITY.NEWS
    ),
    true
  );

  const raulAnalystEmails = [
    "katherinn_devia@cun.edu.co",
    "leidy_diazgranados@cun.edu.co",
    "lidy_alonso@cun.edu.co",
    "monica_pachon@cun.edu.co",
  ] as const;
  for (const email of raulAnalystEmails) {
    const grant = getPlantaActivaGrant(email);
    assert.ok(grant, email);
    assert.deepEqual(grant!.viewAreaIds, [1, 9]);
    assert.deepEqual(grant!.editAreaIds, [1, 9]);
    assert.equal(grant!.excludeLiteAndDocenteRoles, undefined);
    assert.deepEqual(grant!.extraCapabilities, [
      "view:academic_load",
      "view:news",
    ]);
    assert.equal(canViewPlantaArea(grant, 1), true);
    assert.equal(canViewPlantaArea(grant, 9), true);
    assert.equal(canViewPlantaArea(grant, 2), false);
    assert.equal(canEditPlantaArea(grant, 1), true);
    assert.equal(canEditPlantaArea(grant, 9), true);
    assert.equal(canEditPlantaArea(grant, 2), false);
    assert.equal(
      canEditPlantaPerson(grant, 1, { roleName: "LITE" }),
      true
    );
    assert.equal(
      canEditPlantaPerson(grant, 9, { roleName: "DOCENTE" }),
      true
    );
    const access = resolvePlantaActivaGrantAccess(grant);
    assert.equal(access.capabilities.includes(ORBIT_CAPABILITY.PLANTA_ACTIVA), true);
    assert.equal(access.capabilities.includes(ORBIT_CAPABILITY.ACADEMIC_LOAD), true);
    assert.equal(access.capabilities.includes(ORBIT_CAPABILITY.NEWS), true);
  }

  assert.equal(getPlantaActivaGrant("camilo_quintero@cun.edu.co"), null);
});

test("isEmailAuthorizedForOrbit includes planta grants", () => {
  assert.equal(isEmailAuthorizedForOrbit("sara_murillofo@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("cindy_russi@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("leidy_bernal@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("tania_rocha@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("katherinn_devia@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("leidy_diazgranados@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("lidy_alonso@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("monica_pachon@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("otro@cun.edu.co"), false);
  assert.equal(isEmailAuthorizedForOrbit("camilo_quintero@cun.edu.co"), true);
  assert.equal(isEmailAuthorizedForOrbit("zuany_acuna@cun.edu.co"), true);
});

console.log("orbitCapabilities tests passed");
