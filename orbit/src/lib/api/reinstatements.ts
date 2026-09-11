import { BASE_URL } from "./config";
import { apiUrl, authFetch, handleJson, jsonHeaders, type PaginatedResponse } from "./http";

export async function getReinstatements(params?: {
  status?: string;
  decision?: string;
  page?: number;
  limit?: number;
}): Promise<PaginatedResponse> {
  const response = await authFetch(
    apiUrl("/reinstatements", {
      status: params?.status,
      decision: params?.decision,
      page: params?.page,
      limit: params?.limit,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export async function updateReinstatement(
  id: number,
  data: unknown
): Promise<unknown> {
  const response = await authFetch(`${BASE_URL}/reinstatements/${id}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(data),
  });
  return handleJson(response);
}
