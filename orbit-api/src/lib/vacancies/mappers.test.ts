import assert from "node:assert/strict";
import {
  mapComplianceFields,
  mapListRow,
  mapNotesFromJsonRaw,
  mapRequisition,
  mapVacancyRow,
} from "./mappers";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

const ISO = "2025-03-04T15:00:00.000Z";

test("mapComplianceFields distingue false de ausente", () => {
  assert.deepEqual(
    mapComplianceFields({
      shortlist_complied: true,
      pda_complied: false,
      contract_conditions_complied: null,
      // pre_interview_cv_complied ausente
    }),
    {
      shortlistComplied: true,
      pdaComplied: false,
      contractConditionsComplied: null,
      preInterviewCvComplied: null,
    }
  );
});

test("mapVacancyRow normaliza nulos y fechas", () => {
  const row = mapVacancyRow(
    {
      id: 7,
      public_id: "12",
      area_id: "3",
      school_id: null,
      program_id: null,
      position_name: null,
      curricular_line: null,
      quantity: null,
      hired_quantity: null,
      operation_status: null,
      created_at: ISO,
      updated_at: null,
      closed_at: null,
    },
    []
  );
  assert.equal(row.id, "7");
  assert.equal(row.publicId, 12);
  assert.equal(row.areaId, 3);
  assert.equal(row.schoolId, null);
  assert.equal(row.positionName, "");
  assert.equal(row.quantity, 0);
  assert.equal(row.hiredQuantity, 0);
  assert.equal(row.operationStatus, "open");
  assert.equal(row.createdAt, ISO);
  assert.equal(row.updatedAt, undefined);
  assert.equal(row.closedAt, null);
});

test("mapListRow deja programName nulo cuando no hay programa", () => {
  const base = {
    id: "a",
    area_id: 1,
    quantity: 1,
    created_at: ISO,
    area_name: "ÁREA",
    school_name: "ESCUELA",
  };
  assert.equal(mapListRow({ ...base, program_id: null }).programName, null);
  assert.equal(
    mapListRow({ ...base, program_id: 9, program_name: "PROG" }).programName,
    "PROG"
  );
});

test("mapListRow trata las notas de capital en blanco como nulas", () => {
  const base = { id: "a", area_id: 1, quantity: 1, created_at: ISO };
  assert.equal(
    mapListRow({ ...base, requisition_capital_notes: "   " }).capitalNotes,
    null
  );
  assert.equal(
    mapListRow({ ...base, requisition_capital_notes: "OJO" }).capitalNotes,
    "OJO"
  );
});

test("mapRequisition devuelve null sin requisición", () => {
  assert.equal(mapRequisition({ requisition_id: null }), null);
  const r = mapRequisition({
    requisition_id: 4,
    req_number: "REQ-1",
    req_assigned_at: ISO,
    sent_to_capital_at: null,
    requisition_capital_notes: "",
    shortlist_complied: true,
  });
  assert.equal(r?.id, "4");
  assert.equal(r?.reqNumber, "REQ-1");
  assert.equal(r?.assignedAt, ISO);
  assert.equal(r?.sentToCapitalAt, null);
  assert.equal(r?.capitalNotes, null);
  assert.equal(r?.shortlistComplied, true);
});

test("mapNotesFromJsonRaw acepta json agregado o texto", () => {
  const payload = [
    {
      id: 1,
      text: "HOLA",
      createdAt: ISO,
      createdByPersonId: 5,
      createdByName: "ANA",
    },
  ];
  for (const raw of [payload, JSON.stringify(payload)]) {
    assert.deepEqual(mapNotesFromJsonRaw(raw), [
      {
        id: "1",
        text: "HOLA",
        createdAt: ISO,
        createdByPersonId: 5,
        createdByName: "ANA",
      },
    ]);
  }
});

test("mapNotesFromJsonRaw descarta entradas inservibles", () => {
  assert.deepEqual(mapNotesFromJsonRaw(null), []);
  assert.deepEqual(mapNotesFromJsonRaw("no-json"), []);
  assert.deepEqual(mapNotesFromJsonRaw({ id: 1 }), []);
  // sin id o sin texto no hay nota que mostrar
  assert.deepEqual(mapNotesFromJsonRaw([{ id: 1 }, { text: "X" }]), []);
});

test("mapNotesFromJsonRaw admite claves snake_case", () => {
  assert.deepEqual(
    mapNotesFromJsonRaw([
      { id: 2, text: "X", created_at: ISO, created_by_person_id: 8, created_by_name: "  " },
    ]),
    [
      {
        id: "2",
        text: "X",
        createdAt: ISO,
        createdByPersonId: 8,
        createdByName: null,
      },
    ]
  );
});

console.log("vacancies mappers tests passed");
