import type { View, NavItem } from "@/src/types";

export const ORBIT_CAPABILITY = {
  HOME: "view:home",
  TEACHERS: "view:teachers",
  ACADEMIC_LOAD: "view:academic_load",
  COORDINATORS: "view:coordinators",
  LITES: "view:lites",
  VACANCIES: "view:vacancies",
} as const;

export type OrbitCapability =
  (typeof ORBIT_CAPABILITY)[keyof typeof ORBIT_CAPABILITY];

const NAV_ID_TO_CAPABILITY: Record<string, OrbitCapability> = {
  home: ORBIT_CAPABILITY.HOME,
  teachers: ORBIT_CAPABILITY.TEACHERS,
  "academic-load": ORBIT_CAPABILITY.ACADEMIC_LOAD,
  coordinators: ORBIT_CAPABILITY.COORDINATORS,
  lites: ORBIT_CAPABILITY.LITES,
  vacancies: ORBIT_CAPABILITY.VACANCIES,
};

const VIEW_TO_CAPABILITY: Partial<Record<View, OrbitCapability>> = {
  home: ORBIT_CAPABILITY.HOME,
  teachers: ORBIT_CAPABILITY.TEACHERS,
  "teacher-detail": ORBIT_CAPABILITY.TEACHERS,
  vacancies: ORBIT_CAPABILITY.VACANCIES,
  "vacancy-detail": ORBIT_CAPABILITY.VACANCIES,
  coordinators: ORBIT_CAPABILITY.COORDINATORS,
  lites: ORBIT_CAPABILITY.LITES,
  "academic-load": ORBIT_CAPABILITY.ACADEMIC_LOAD,
  reinstatements: ORBIT_CAPABILITY.VACANCIES,
  news: ORBIT_CAPABILITY.HOME,
  audit: ORBIT_CAPABILITY.HOME,
  programs: ORBIT_CAPABILITY.HOME,
  login: ORBIT_CAPABILITY.HOME,
  export: ORBIT_CAPABILITY.HOME,
};

export function capabilityForNavItem(navId: string): OrbitCapability | null {
  return NAV_ID_TO_CAPABILITY[navId] ?? null;
}

export function hasCapability(
  capabilities: readonly string[] | undefined,
  required: OrbitCapability
): boolean {
  if (!capabilities || capabilities.length === 0) return false;
  return capabilities.includes(required);
}

export function filterNavItems(
  items: readonly NavItem[],
  capabilities: readonly string[]
): NavItem[] {
  return items.filter((item) => {
    const cap = capabilityForNavItem(item.id);
    if (!cap) return false;
    return hasCapability(capabilities, cap);
  });
}

export function canAccessView(
  view: View,
  capabilities: readonly string[]
): boolean {
  if (view === "login") return true;
  const cap = VIEW_TO_CAPABILITY[view];
  if (!cap) return false;
  return hasCapability(capabilities, cap);
}

export function canBulkImportTeachers(capabilities: readonly string[]): boolean {
  return hasCapability(capabilities, ORBIT_CAPABILITY.TEACHERS);
}

export function canManageVacancies(capabilities: readonly string[]): boolean {
  return hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES);
}

const LANDING_VIEW_ORDER: View[] = [
  "home",
  "teachers",
  "academic-load",
  "coordinators",
  "lites",
  "vacancies",
];

/** Primera vista del menú a la que el usuario puede entrar. */
export function getDefaultView(capabilities: readonly string[]): View {
  for (const v of LANDING_VIEW_ORDER) {
    if (canAccessView(v, capabilities)) return v;
  }
  return "teachers";
}
