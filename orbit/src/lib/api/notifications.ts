import type { OrbitNotification } from "@/src/types";
import { BASE_URL } from "./config";
import {
  apiUrl,
  assertResponseOk,
  authFetch,
  flag,
  handleJson,
  jsonHeaders,
} from "./http";

export async function getNotifications(params?: {
  unreadOnly?: boolean;
  limit?: number;
}): Promise<OrbitNotification[]> {
  const response = await authFetch(
    apiUrl("/notifications", {
      unreadOnly: flag(params?.unreadOnly),
      limit: params?.limit,
    }),
    { headers: jsonHeaders }
  );
  return handleJson(response);
}

export async function getUnreadNotificationCount(): Promise<number> {
  const response = await authFetch(`${BASE_URL}/notifications/unread-count`, {
    headers: jsonHeaders,
  });
  const data = (await handleJson(response)) as { count?: number };
  return Number(data.count ?? 0);
}

export async function markNotificationRead(id: string): Promise<void> {
  const response = await authFetch(
    `${BASE_URL}/notifications/${encodeURIComponent(id)}/read`,
    { method: "PATCH", headers: jsonHeaders }
  );
  await assertResponseOk(response);
}

export async function markAllNotificationsRead(): Promise<void> {
  const response = await authFetch(`${BASE_URL}/notifications/read-all`, {
    method: "PATCH",
    headers: jsonHeaders,
  });
  await assertResponseOk(response);
}
