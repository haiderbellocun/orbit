/**
 * Person visibility in Orbit listings (LITE, coordinador, docente).
 * NULL is treated as active for backward compatibility before is_active exists / backfill.
 */
export function sqlPersonIsActive(alias: string): string {
  return `COALESCE(${alias}.is_active, true) = true`;
}

/** Valor API `status`: 'active' | 'inactive' según person.is_active */
export function sqlPersonStatusText(alias: string): string {
  return `CASE WHEN COALESCE(${alias}.is_active, true) THEN 'active'::text ELSE 'inactive'::text END`;
}
