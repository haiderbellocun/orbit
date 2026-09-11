import { BASE_URL } from "./config";
import {
  apiUrl,
  authFetch,
  flag,
  handleJson,
  jsonHeaders,
  type PaginatedResponse,
} from "./http";

export type SubstantiveHoursTeacher = {
  id: string;
  document: string;
  name: string;
  email: string;
  area: string;
  school: string;
  contractType: string;
  workSchedule: string;
  roleName: string;
  isLite: boolean;
  contractHoursWeekly: number | null;
  catedraHours: number;
  preparationHours: number;
  substantiveHoursAssigned: number;
  substantiveHoursRemaining: number | null;
  teachingModality: "presencial" | "virtual" | "mixto" | null;
  creditsPresencial: number;
  studentsVirtual: number;
  creditTarget: number | null;
  studentTarget: number | null;
  loadIndex: number | null;
  fulfillmentPct: number | null;
  quotaStatus: "under" | "ok" | "over" | "unknown";
  creditsGap: number | null;
  studentsGap: number | null;
  actionHint: string | null;
};

export type SubstantiveHoursCategory = {
  id: number | null;
  name: string;
};

export type SubstantiveHoursAssignmentTask = {
  id: number;
  description: string;
  sortOrder: number;
};

export type SubstantiveHoursAssignment = {
  id: number;
  personId: number;
  categoryId: number | null;
  categoryName: string;
  hoursQuantity: number;
  createdAt: string;
  updatedAt: string;
  tasks: SubstantiveHoursAssignmentTask[];
};

export async function getSubstantiveHoursTeachers(params?: {
  search?: string;
  area_id?: number;
  school_id?: number;
  period?: string;
  contract_hours?: 21 | 42;
  availability?: "available" | "none" | "unknown";
  has_catedra?: boolean;
  has_substantive?: boolean;
  without_edu_email?: boolean;
  role?: "docente" | "docente_pensionado" | "lite";
  teaching_modality?: "presencial" | "virtual" | "mixto";
  quota_status?: "under" | "ok" | "over" | "unknown";
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<SubstantiveHoursTeacher>> {
  const response = await authFetch(
    apiUrl("/substantive-hours/teachers", {
      search: params?.search,
      area_id: params?.area_id,
      school_id: params?.school_id,
      period: params?.period,
      contract_hours: params?.contract_hours,
      availability: params?.availability,
      has_catedra: params?.has_catedra,
      has_substantive: params?.has_substantive,
      without_edu_email: flag(params?.without_edu_email),
      role: params?.role,
      teaching_modality: params?.teaching_modality,
      quota_status: params?.quota_status,
      page: params?.page,
      limit: params?.limit,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export async function getSubstantiveHoursCategories(): Promise<
  SubstantiveHoursCategory[]
> {
  const response = await authFetch(apiUrl("/substantive-hours/categories"), {
    headers: jsonHeaders,
  });
  const json = (await handleJson(response)) as {
    data?: SubstantiveHoursCategory[];
  };
  return Array.isArray(json.data) ? json.data : [];
}

export async function getSubstantiveHoursAssignments(
  personId: number
): Promise<SubstantiveHoursAssignment[]> {
  const response = await authFetch(
    `${BASE_URL}/substantive-hours/teachers/${personId}/assignments`,
    { headers: jsonHeaders }
  );
  const json = (await handleJson(response)) as {
    data?: SubstantiveHoursAssignment[];
  };
  return Array.isArray(json.data) ? json.data : [];
}

export async function createSubstantiveHoursAssignment(body: {
  personId: number;
  categoryId?: number | null;
  hoursQuantity: number;
  tasks: string[];
}): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/substantive-hours/assignments`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  return handleJson(response);
}

export type ClassPreparationUpdateResult = {
  id: number;
  personId: number;
  preparationHours: number;
  contractHoursWeekly: number | null;
  catedraHours: number;
  substantiveHoursAssigned: number;
  substantiveHoursRemaining: number | null;
  updatedAt: string;
};

/** Upsert horas semanales de preparación de clase del docente. */
export async function updateClassPreparationHours(
  personId: number,
  hoursQuantity: number
): Promise<ClassPreparationUpdateResult> {
  const response = await authFetch(
    `${BASE_URL}/substantive-hours/teachers/${personId}/class-preparation`,
    {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify({ hoursQuantity }),
    }
  );
  const json = (await handleJson(response)) as {
    data: ClassPreparationUpdateResult;
  };
  return json.data;
}
