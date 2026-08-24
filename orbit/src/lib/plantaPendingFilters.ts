const STORAGE_KEY = "orbit_planta_pending_filters";

export type PlantaPendingFilters = {
  withoutEduEmail?: boolean;
  withoutDocument?: boolean;
};

export function setPlantaPendingFilters(filters: PlantaPendingFilters): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    /* ignore */
  }
}

export function peekPlantaPendingFilters(): PlantaPendingFilters | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlantaPendingFilters;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPlantaPendingFilters(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
