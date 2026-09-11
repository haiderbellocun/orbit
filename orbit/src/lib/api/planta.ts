import { BASE_URL } from "./config";
import {
  apiUrl,
  authFetch,
  flag,
  handleJson,
  jsonHeaders,
  type PaginatedResponse,
} from "./http";

export async function getPersonal(params?: {
  search?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const response = await authFetch(
    apiUrl("/personal", {
      search: params?.search,
      page: params?.page,
      limit: params?.limit,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export type PlantaActivaFilters = {
  search?: string;
  area_id?: number;
  school_id?: number;
  program_id?: number;
  role_id?: number;
  without_school?: boolean;
  without_program?: boolean;
  without_role?: boolean;
  without_edu_email?: boolean;
  without_document?: boolean;
  /** `active` (default) | `inactive` */
  status?: "active" | "inactive";
  page?: number;
  limit?: number;
  include_org?: boolean;
};

export type UpdatePlantaPersonPayload = {
  second_in_command_scopes?: string[];
  full_name?: string;
  document?: string;
  email?: string | null;
  edu_email?: string | null;
  phone?: string | null;
  address?: string | null;
  area_id?: number | null;
  school_id?: number | null;
  program_id?: number | null;
  role_id?: number | null;
  is_active?: boolean;
  /** Al inactivar: crear vacante (default true). Ignorado si el rol no aplica. */
  create_vacancy?: boolean;
};

export type CreatePlantaPersonPayload = {
  second_in_command_scopes?: string[];
  full_name: string;
  document: string;
  type_document?: string | null;
  email?: string | null;
  edu_email?: string | null;
  phone?: string | null;
  address?: string | null;
  area_id?: number | null;
  school_id?: number | null;
  program_id?: number | null;
  role_id?: number | null;
  is_active?: boolean;
};

export async function getPlantaActiva(
  params?: PlantaActivaFilters
): Promise<PaginatedResponse> {
  const response = await authFetch(
    apiUrl("/planta-activa", {
      search: params?.search,
      area_id: params?.area_id,
      school_id: params?.school_id,
      program_id: params?.program_id,
      role_id: params?.role_id,
      without_school: flag(params?.without_school),
      without_program: flag(params?.without_program),
      without_role: flag(params?.without_role),
      without_edu_email: flag(params?.without_edu_email),
      without_document: flag(params?.without_document),
      status: params?.status,
      page: params?.page,
      limit: params?.limit,
      include_org: flag(params?.include_org),
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export async function getPlantaPerson(id: number): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/planta-activa/${id}`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}

export async function createPlantaPerson(
  data: CreatePlantaPersonPayload
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/planta-activa`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function updatePlantaPerson(
  id: number,
  data: UpdatePlantaPersonPayload
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/planta-activa/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}

export async function updatePlantaOrgParent(
  id: number,
  parentPersonId: number | null,
  opts?: { followOrganigrama?: boolean }
): Promise<unknown> {
  const response = await authFetch(
    `${BASE_URL}/planta-activa/${id}/org-parent`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(
        opts?.followOrganigrama
          ? { follow_organigrama: true }
          : { parent_person_id: parentPersonId }
      ),
    }
  );
  return handleJson(response);
}

export type BulkOrgParentResult = {
  ok: boolean;
  parent_person_id: number;
  assigned_count: number;
  failed_count: number;
  assigned: number[];
  failed: Array<{ person_id: number; error: string }>;
};

/** Asigna varias personas al mismo responsable en un solo request. */
export async function bulkUpdatePlantaOrgParent(
  parentPersonId: number,
  childPersonIds: number[]
): Promise<BulkOrgParentResult> {
  const response = await authFetch(
    `${BASE_URL}/planta-activa/org-parents/bulk`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        parent_person_id: parentPersonId,
        child_person_ids: childPersonIds,
      }),
    }
  );
  return handleJson(response);
}
