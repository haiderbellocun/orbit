import { BASE_URL } from "./config";
import { apiUrl, authFetch, handleJson, jsonHeaders, type PaginatedResponse } from "./http";

export type WorkforceEventStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "TAKEN"
  | "NOT_TAKEN"
  | "CANCELLED";

export type WorkforceEventType = {
  id: number;
  name: string;
  description: string | null;
};

export type WorkforceEventPersonRef = {
  id: number;
  name: string;
  document: string | null;
  school_id: number | null;
  school_name: string | null;
  area_name: string | null;
};

export type WorkforceEvent = {
  id: string;
  event_type_id: number;
  event_type_name: string;
  observation: string | null;
  status: WorkforceEventStatus;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  created_at: string;
  updated_at: string;
  person: WorkforceEventPersonRef;
  created_by_person: { id: number; name: string };
};

export async function getWorkforceEventTypes(): Promise<WorkforceEventType[]> {
  const res = await authFetch(apiUrl("/workforce-events/event-types"), {
    headers: jsonHeaders,
  });
  const json = (await handleJson(res)) as { data?: WorkforceEventType[] };
  return json.data ?? [];
}

export async function getWorkforceEvents(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: WorkforceEventStatus;
  event_type_id?: number;
  person_id?: number;
  school_id?: number;
  area_id?: number;
}): Promise<PaginatedResponse<WorkforceEvent>> {
  const res = await authFetch(
    apiUrl("/workforce-events/events", {
      page: params?.page,
      limit: params?.limit,
      search: params?.search?.trim(),
      status: params?.status,
      event_type_id: params?.event_type_id,
      person_id: params?.person_id,
      school_id: params?.school_id,
      area_id: params?.area_id,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(res) as Promise<PaginatedResponse<WorkforceEvent>>;
}

export async function getWorkforceEvent(id: string): Promise<WorkforceEvent> {
  const res = await authFetch(
    `${BASE_URL}/workforce-events/events/${encodeURIComponent(id)}`,
    { headers: jsonHeaders }
  );
  return handleJson(res) as Promise<WorkforceEvent>;
}

export async function createWorkforceEvent(body: {
  event_type_id: number;
  person_id: number;
  observation?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  status?: WorkforceEventStatus;
}): Promise<WorkforceEvent> {
  const res = await authFetch(`${BASE_URL}/workforce-events/events`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(body),
  });
  return handleJson(res) as Promise<WorkforceEvent>;
}

export type WorkforceEventStatusLog = {
  id: number;
  event_id: string;
  previous_status: WorkforceEventStatus | null;
  new_status: WorkforceEventStatus;
  changed_at: string;
  changed_by_person: { id: number; name: string };
};

export async function getWorkforceEventStatusLog(
  eventId: string
): Promise<WorkforceEventStatusLog[]> {
  const res = await authFetch(
    `${BASE_URL}/workforce-events/events/${encodeURIComponent(eventId)}/status-log`,
    { headers: jsonHeaders }
  );
  const json = (await handleJson(res)) as { data?: WorkforceEventStatusLog[] };
  return json.data ?? [];
}

/** Actualiza únicamente el estado; el backend registra el historial. */
export async function patchWorkforceEventStatus(
  id: string,
  status: WorkforceEventStatus
): Promise<WorkforceEvent> {
  const res = await authFetch(
    `${BASE_URL}/workforce-events/events/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify({ status }),
    }
  );
  return handleJson(res) as Promise<WorkforceEvent>;
}

/** @deprecated Usar patchWorkforceEventStatus */
export async function patchWorkforceEvent(
  id: string,
  body: { status: WorkforceEventStatus }
): Promise<WorkforceEvent> {
  return patchWorkforceEventStatus(id, body.status);
}
