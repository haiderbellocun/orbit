import { apiUrl, authFetch, handleJson, jsonHeaders } from "./http";

export type CatalogArea = { id: number; name: string };
export type CatalogSchool = { id: number; name: string; area_id: number | null };
export type CatalogProgram = { id: number; name: string; school_id: number | null };
export type CatalogRole = { id: number; name: string };
export async function getCatalogAreas(): Promise<CatalogArea[]> {
  const response = await authFetch(apiUrl("/catalog/areas"), {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getCatalogSchools(params?: {
  area_id?: number;
}): Promise<CatalogSchool[]> {
  const response = await authFetch(
    apiUrl("/catalog/schools", { area_id: params?.area_id }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export async function getCatalogRoles(): Promise<CatalogRole[]> {
  const response = await authFetch(apiUrl("/catalog/roles"), {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function getCatalogPrograms(params?: {
  school_id?: number;
  area_id?: number;
}): Promise<CatalogProgram[]> {
  const response = await authFetch(
    apiUrl("/catalog/programs", {
      school_id: params?.school_id,
      area_id: params?.area_id,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

/** Líneas académicas ya usadas en `person_program_assignments` (sugerencias). */
export async function getCatalogAcademicLines(): Promise<string[]> {
  const response = await authFetch(apiUrl("/catalog/academic-lines"), {
    headers: jsonHeaders,
  });
  return handleJson(response);
}
