import { BASE_URL } from "./config";
import { authFetch, handleJson, jsonHeaders } from "./http";

export type ManagedRole = {
  id: number;
  code: string | null;
  name: string;
  description: string | null;
  category: string | null;
  is_active: boolean;
  assigned_count: number;
};

export async function getManagedRoles(): Promise<ManagedRole[]> {
  const response = await authFetch(`${BASE_URL}/roles`, { headers: jsonHeaders });
  return handleJson(response);
}

export async function createManagedRole(name: string, code: string): Promise<ManagedRole> {
  const response = await authFetch(`${BASE_URL}/roles`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify({ name, code }),
  });
  return handleJson(response);
}

export async function updateManagedRole(id: number, name: string, code: string): Promise<ManagedRole> {
  const response = await authFetch(`${BASE_URL}/roles/${id}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ name, code }),
  });
  return handleJson(response);
}

export async function updateManagedRoleStatus(
  id: number,
  isActive: boolean
): Promise<ManagedRole> {
  const response = await authFetch(`${BASE_URL}/roles/${id}/status`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify({ is_active: isActive }),
  });
  return handleJson(response);
}
