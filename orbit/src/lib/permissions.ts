import type { View, NavItem } from "@/src/types";

export const ORBIT_CAPABILITY = {
  HOME: "view:home",
  ACADEMIC_LOAD: "view:academic_load",
  SUBSTANTIVE_HOURS: "view:substantive_hours",
  VACANCIES: "view:vacancies",
  VACANCIES_INFORMATIVE_PANEL: "vacancies:informative_panel",
  VACANCIES_ADMIN: "vacancies:admin",
  ROLES_MANAGE: "roles:manage",
  PLANTA_ACTIVA: "view:planta_activa",
  NEWS: "view:news",
} as const;

export type OrbitCapability =
  (typeof ORBIT_CAPABILITY)[keyof typeof ORBIT_CAPABILITY];

const NAV_ID_TO_CAPABILITY: Record<string, OrbitCapability> = {
  home: ORBIT_CAPABILITY.HOME,
  "academic-load": ORBIT_CAPABILITY.ACADEMIC_LOAD,
  "substantive-hours": ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
  vacancies: ORBIT_CAPABILITY.VACANCIES,
  "vacancy-informative-panel": ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL,
  "planta-activa": ORBIT_CAPABILITY.PLANTA_ACTIVA,
  roles: ORBIT_CAPABILITY.ROLES_MANAGE,
  news: ORBIT_CAPABILITY.NEWS,
};

const VIEW_TO_CAPABILITY: Partial<Record<View, OrbitCapability>> = {
  home: ORBIT_CAPABILITY.HOME,
  vacancies: ORBIT_CAPABILITY.VACANCIES,
  "vacancy-detail": ORBIT_CAPABILITY.VACANCIES,
  "vacancy-informative-panel": ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL,
  "academic-load": ORBIT_CAPABILITY.ACADEMIC_LOAD,
  "substantive-hours": ORBIT_CAPABILITY.SUBSTANTIVE_HOURS,
  reinstatements: ORBIT_CAPABILITY.VACANCIES,
  news: ORBIT_CAPABILITY.NEWS,
  audit: ORBIT_CAPABILITY.HOME,
  programs: ORBIT_CAPABILITY.HOME,
  "planta-activa": ORBIT_CAPABILITY.PLANTA_ACTIVA,
  roles: ORBIT_CAPABILITY.ROLES_MANAGE,
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

/**
 * Panel informativo: oculto en todos los perfiles hasta que se implemente.
 * El módulo, la vista y las capabilities se conservan; poner en `true` para reactivar.
 */
export const VACANCY_INFORMATIVE_PANEL_ENABLED = false;

/** Panel informativo: capability dedicada o administración de vacantes (rol 38). */
export function canAccessVacancyInformativePanel(
  capabilities: readonly string[] | undefined
): boolean {
  if (!VACANCY_INFORMATIVE_PANEL_ENABLED) return false;
  return (
    hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES_INFORMATIVE_PANEL) ||
    hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES_ADMIN)
  );
}

export function filterNavItems(
  items: readonly NavItem[],
  capabilities: readonly string[]
): NavItem[] {
  return items.filter((item) => {
    if (item.id === "vacancy-informative-panel") {
      return canAccessVacancyInformativePanel(capabilities);
    }
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
  if (view === "vacancy-informative-panel") {
    return canAccessVacancyInformativePanel(capabilities);
  }
  const cap = VIEW_TO_CAPABILITY[view];
  if (!cap) return false;
  return hasCapability(capabilities, cap);
}

export function canManageVacancies(capabilities: readonly string[]): boolean {
  return hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES);
}

export function canVacancyAdmin(capabilities: readonly string[]): boolean {
  return hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES_ADMIN);
}

/** `role_id` del usuario en sesión (orbit_user). */
export function getStoredRoleId(): number | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("orbit_user");
    if (!raw) return null;
    const u = JSON.parse(raw) as { roleId?: unknown };
    const n =
      typeof u.roleId === "number"
        ? u.roleId
        : Number.parseInt(String(u.roleId ?? ""), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

const LANDING_VIEW_ORDER: View[] = [
  "planta-activa",
  "news",
  "academic-load",
  "substantive-hours",
];

/** Primera vista del menú a la que el usuario puede entrar. */
export function getDefaultView(capabilities: readonly string[]): View {
  if (canAccessView("home", capabilities)) return "home";
  if (canAccessView("vacancies", capabilities)) return "vacancies";
  for (const v of LANDING_VIEW_ORDER) {
    if (canAccessView(v, capabilities)) return v;
  }
  return "home";
}
