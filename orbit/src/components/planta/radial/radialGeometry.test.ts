import assert from 'node:assert/strict';
import {
  approachAngle,
  pageWindow,
  segmentEdges,
  wedgePath,
  wrapLabel,
} from './radialGeometry.ts';

const right = approachAngle(350, 10);
assert.ok(Math.abs(right - 370) < 1e-9, `expected short path, got ${right}`);

const left = approachAngle(10, 350);
assert.ok(Math.abs(left - -10) < 1e-9, `expected short path, got ${left}`);

const single = segmentEdges(1);
assert.equal(single.length, 1);
assert.ok(Math.abs(single[0].mid) < 1e-9);
assert.ok(single[0].start < 0 && single[0].end > 0);

const many = segmentEdges(8);
assert.equal(many.length, 8);
assert.ok(many[0].mid < 0 && many[7].mid > 0);
assert.ok(many.every((seg, index) => index === 0 || seg.start > many[index - 1].end));

const paged = pageWindow([1, 2, 3, 4, 5], 1, 2);
assert.deepEqual(paged.items, [3, 4]);
assert.equal(paged.pages, 3);
assert.deepEqual(pageWindow([1], 4, 2).items, [1]);

const path = wedgePath(0, 0, 10, 20, -0.4, 0.4);
assert.ok(path.startsWith('M '));
assert.ok(path.includes('A 20 20'));
assert.ok(path.endsWith('Z'));

assert.deepEqual(wrapLabel('Dirección General de Operaciones', 12, 3).length, 3);
assert.ok(wrapLabel('Dirección General de Operaciones', 12, 2).at(-1)?.endsWith('…'));

console.log('radialGeometry ok');
