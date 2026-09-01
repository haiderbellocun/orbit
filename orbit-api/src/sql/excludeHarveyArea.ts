/**
 * Área investigativa (Harvey / Jarvey en catálogo).
 * Requiere JOIN a `area` como `${areaAlias}` sobre COALESCE(person.area_id, school.area_id).
 */
export function sqlExcludeHarveyArea(areaAlias = "a"): string {
  return `(
    ${areaAlias}.id IS NULL
    OR (
      COALESCE(${areaAlias}.name, '') NOT ILIKE '%investigativ%'
      AND COALESCE(${areaAlias}.name, '') NOT ILIKE '%harvey%'
      AND COALESCE(${areaAlias}.name, '') NOT ILIKE '%jarvey%'
    )
  )`;
}

/** Programa denormalizado de carga (ACA). */
export const SQL_ACADEMIC_PROGRAM_NAME = `COALESCE(al.program_name, pr.name, '')`;

/**
 * Programa de Vicerrectoría Acad. y de Investigación (área Harvey).
 * Cubre filas cuyo docente no tiene area_id pero el program_name sí es de Harvey.
 */
export function sqlExcludeHarveyProgram(
  programExpr = SQL_ACADEMIC_PROGRAM_NAME
): string {
  return `${programExpr} NOT ILIKE '%vicerrector%investig%'`;
}

export function sqlExcludeHarveyFromAcademicLoad(areaAlias = "a"): string {
  return `(${sqlExcludeHarveyArea(areaAlias)} AND ${sqlExcludeHarveyProgram()})`;
}
