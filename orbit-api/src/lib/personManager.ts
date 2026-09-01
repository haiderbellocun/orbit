/**
 * Relación jerárquica persona → responsable directo (`person.manager_id`).
 * Validaciones puras (sin I/O) para tests; el SQL de ciclo vive en la ruta.
 */

export function isSelfManager(
  personId: number,
  managerId: number | null | undefined
): boolean {
  return managerId != null && personId === managerId;
}

/**
 * True si asignar `newManagerId` como responsable de `personId` crea un ciclo.
 * `managerById` mapea id → manager_id actual (puede omitir hojas).
 */
export function managerAssignmentCreatesCycle(
  personId: number,
  newManagerId: number | null,
  managerById: ReadonlyMap<number, number | null | undefined>
): boolean {
  if (newManagerId == null) return false;
  if (personId === newManagerId) return true;

  const seen = new Set<number>();
  let cursor: number | null | undefined = newManagerId;
  let depth = 0;
  while (cursor != null && depth < 64) {
    if (cursor === personId) return true;
    if (seen.has(cursor)) return true;
    seen.add(cursor);
    const next = managerById.get(cursor);
    cursor = next == null ? null : next;
    depth += 1;
  }
  return false;
}
