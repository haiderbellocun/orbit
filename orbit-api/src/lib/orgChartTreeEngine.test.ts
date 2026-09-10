import assert from "node:assert/strict";
import {
  applyPlantaOrgOverrides,
  assignmentCreatesOrgCycle,
  collectHierarchyLinePersonIds,
  collectHierarchyDescendantPersonIds,
  buildChildIndex,
  childrenForPerson,
  orgNodeKey,
} from "./orgChartTreeEngine";

function test(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`ok: ${name}`);
  } catch (e) {
    console.error(`fail: ${name}`);
    throw e;
  }
}

test("position_child gana sobre aristas por persona", () => {
  const index = buildChildIndex({
    relations: [
      {
        id: 10,
        parent_person_id: 1,
        child_person_id: 20,
        visual_level: 1,
      },
      {
        id: 11,
        parent_person_id: 1,
        child_person_id: 21,
        visual_level: 2,
      },
    ],
    positionChildren: [
      { parent_relation_id: 99, child_person_id: 30, visual_level: 1 },
    ],
  });

  const byPosition = childrenForPerson(1, 99, index);
  assert.equal(byPosition.length, 1);
  assert.equal(byPosition[0].personId, 30);
  assert.equal(byPosition[0].relationId, null);
  assert.equal(byPosition[0].source, "position");

  const byPerson = childrenForPerson(1, null, index);
  assert.equal(byPerson.length, 2);
  assert.equal(byPerson[0].source, "relation");
  assert.equal(byPerson[0].relationId, 10);
});

test("sin position_child usa aristas por parent_person_id", () => {
  const index = buildChildIndex({
    relations: [
      {
        id: 5,
        parent_person_id: 8,
        child_person_id: 9,
        visual_level: 3,
      },
    ],
    positionChildren: [],
  });
  const children = childrenForPerson(8, 123, index);
  assert.equal(children.length, 1);
  assert.equal(children[0].personId, 9);
  assert.equal(children[0].relationId, 5);
  assert.equal(children[0].source, "relation");
});

test("identidad del nodo es (persona, relation_id)", () => {
  assert.equal(orgNodeKey(49, 100), "rel:100");
  assert.equal(orgNodeKey(49, null, 100), "pos:100:49");
  assert.equal(orgNodeKey(49, null), "person:49");
  assert.notEqual(orgNodeKey(49, 1), orgNodeKey(49, 2));
});

test("ciclo: hijo no puede colgar de su descendiente", () => {
  const parentByChild = new Map<number, number[]>([
    [2, [1]],
    [3, [2]],
  ]);
  assert.equal(assignmentCreatesOrgCycle(1, 3, parentByChild), true);
  assert.equal(assignmentCreatesOrgCycle(3, 1, parentByChild), false);
  assert.equal(assignmentCreatesOrgCycle(4, 4, parentByChild), true);
});

test("overrides de Planta no mezclan y ganan sobre organigrama", () => {
  const base = [
    { id: 1, parent_person_id: 10, child_person_id: 20, visual_level: 1 },
    { id: 2, parent_person_id: 10, child_person_id: 21, visual_level: 1 },
  ];
  const positions = [
    { parent_relation_id: 1, child_person_id: 30, visual_level: 1 },
  ];
  const moved = applyPlantaOrgOverrides(base, positions, [
    { person_id: 20, parent_person_id: 99 },
  ]);
  assert.equal(
    moved.relations.some((e) => e.parent_person_id === 10 && e.child_person_id === 20),
    false
  );
  const synthetic = moved.relations.find((e) => e.child_person_id === 20);
  assert.equal(synthetic?.parent_person_id, 99);
  assert.ok((synthetic?.id ?? 0) < 0);

  const detached = applyPlantaOrgOverrides(base, positions, [
    { person_id: 30, parent_person_id: null },
  ]);
  assert.equal(detached.positionChildren.length, 0);
  assert.equal(
    detached.relations.some((e) => e.child_person_id === 30),
    false
  );
});

test("alcance jerarquico incluye superiores y descendientes, no ramas hermanas", () => {
  const visible = collectHierarchyLinePersonIds(
    20,
    [
      { id: 1, parent_person_id: 10, child_person_id: 20, visual_level: 1 },
      { id: 2, parent_person_id: 10, child_person_id: 21, visual_level: 1 },
      { id: 3, parent_person_id: 20, child_person_id: 30, visual_level: 2 },
      { id: 4, parent_person_id: 21, child_person_id: 40, visual_level: 2 },
    ],
    [{ parent_relation_id: 3, child_person_id: 31, visual_level: 3 }]
  );
  assert.deepEqual([...visible].sort((a, b) => a - b), [10, 20, 30, 31]);
});

test("edicion jerarquica incluye solo descendientes", () => {
  const descendants = collectHierarchyDescendantPersonIds(
    20,
    [
      { id: 1, parent_person_id: 10, child_person_id: 20, visual_level: 1 },
      { id: 2, parent_person_id: 10, child_person_id: 21, visual_level: 1 },
      { id: 3, parent_person_id: 20, child_person_id: 30, visual_level: 2 },
      { id: 4, parent_person_id: 30, child_person_id: 40, visual_level: 3 },
    ],
    []
  );
  assert.deepEqual([...descendants].sort((a, b) => a - b), [30, 40]);
});
