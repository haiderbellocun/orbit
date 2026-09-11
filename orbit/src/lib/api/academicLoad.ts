import { apiUrl, authFetch, handleJson, jsonHeaders, type PaginatedResponse } from "./http";

export type AcademicLoadFilterOptions = {
  periods: string[];
  blocks: string[];
  programs: string[];
  modalities: { value: string; label: string }[];
  studyLevels: { value: string; label: string }[];
};

export async function getAcademicLoadFilterOptions(): Promise<AcademicLoadFilterOptions> {
  const response = await authFetch(apiUrl("/academic-load/filter-options"), {
    headers: jsonHeaders,
  });
  const json = (await handleJson(response)) as Partial<AcademicLoadFilterOptions>;
  return {
    periods: Array.isArray(json.periods) ? json.periods.map(String) : [],
    blocks: Array.isArray(json.blocks) ? json.blocks.map(String) : [],
    programs: Array.isArray(json.programs) ? json.programs.map(String) : [],
    modalities: Array.isArray(json.modalities)
      ? json.modalities.map((m) => ({
          value: String((m as { value: string }).value),
          label: String((m as { label: string }).label),
        }))
      : [
          { value: "P", label: "Presencial" },
          { value: "V", label: "Virtual" },
        ],
    studyLevels: Array.isArray(json.studyLevels)
      ? json.studyLevels.map((m) => ({
          value: String((m as { value: string }).value),
          label: String((m as { label: string }).label),
        }))
      : [
          { value: "pregrado", label: "Pregrado" },
          { value: "especializacion", label: "Especialización" },
        ],
  };
}

export async function getAcademicLoad(params?: {
  teacher_document?: string;
  person_id?: number;
  period?: string;
  unit_name?: string;
  search?: string;
  modality?: string;
  type?: string;
  area_id?: number;
  school_id?: number;
  program?: string;
  subject?: string;
  group_code?: string;
  block?: string;
  study_level?: "pregrado" | "especializacion" | "otro" | string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const response = await authFetch(
    apiUrl("/academic-load", {
      teacher_document: params?.teacher_document,
      person_id: params?.person_id,
      period: params?.period,
      unit_name: params?.unit_name,
      search: params?.search,
      modality: params?.modality,
      type: params?.type,
      area_id: params?.area_id,
      school_id: params?.school_id,
      program: params?.program,
      subject: params?.subject,
      group_code: params?.group_code,
      block: params?.block,
      study_level: params?.study_level,
      page: params?.page,
      limit: params?.limit,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export type AcademicLoadTeacherSummary = {
  personId: number;
  document: string;
  name: string;
  area: string;
  school: string;
  contractType: string;
  workSchedule: string;
  contractHoursWeekly: number | null;
  assignmentCount: number;
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

export async function getAcademicLoadTeacherSummaries(params?: {
  search?: string;
  period?: string;
  modality?: string;
  area_id?: number;
  school_id?: number;
  program?: string;
  subject?: string;
  group_code?: string;
  block?: string;
  study_level?: "pregrado" | "especializacion" | "otro" | string;
  teaching_modality?: "presencial" | "virtual" | "mixto";
  quota_status?: "under" | "ok" | "over" | "unknown";
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse<AcademicLoadTeacherSummary>> {
  const response = await authFetch(
    apiUrl("/academic-load/teacher-summaries", {
      search: params?.search,
      period: params?.period,
      modality: params?.modality,
      area_id: params?.area_id,
      school_id: params?.school_id,
      program: params?.program,
      subject: params?.subject,
      group_code: params?.group_code,
      block: params?.block,
      study_level: params?.study_level,
      teaching_modality: params?.teaching_modality,
      quota_status: params?.quota_status,
      page: params?.page,
      limit: params?.limit,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export async function getAcademicLoadSummary(): Promise<unknown> {
  const response = await authFetch(apiUrl("/academic-load/summary"), {
    headers: jsonHeaders,
  });
  return handleJson(response);
}
