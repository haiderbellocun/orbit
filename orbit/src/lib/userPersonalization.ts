export type StoredUserProfile = {
  id?: number;
  personId?: number | null;
  email?: string;
  name?: string;
  picture?: string;
  roleCode?: string | null;
  roleName?: string | null;
  areaName?: string | null;
};

export function getStoredUserProfile(): StoredUserProfile | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("orbit_user");
    return raw ? (JSON.parse(raw) as StoredUserProfile) : null;
  } catch {
    return null;
  }
}

export function getFirstName(fullName?: string | null): string {
  return fullName?.trim().split(/\s+/)[0] || "";
}

export function getDayPeriodGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function getProfileContext(profile: StoredUserProfile | null): string {
  return [profile?.roleName || profile?.roleCode, profile?.areaName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" · ");
}
