import assert from 'node:assert/strict';
import { normalizeSecondInCommandScopes } from './secondInCommand';

assert.deepEqual(normalizeSecondInCommandScopes([' Fábrica  de contenidos ', 'FABRICA DE CONTENIDOS', 'Desarrollo']), ['FABRICA DE CONTENIDOS', 'DESARROLLO']);
assert.deepEqual(normalizeSecondInCommandScopes([]), []);
for (const invalid of [null, false, 'SERVICIO', [1], [''], ['  '], ['x'.repeat(201)], [['SERVICIO']]]) {
  assert.throws(() => normalizeSecondInCommandScopes(invalid));
}
console.log('secondInCommand: validación, duplicados y múltiples áreas OK');
