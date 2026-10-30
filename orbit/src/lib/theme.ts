export type Theme = "dark" | "light";

const STORAGE_KEY = "orbit_theme";
export const DEFAULT_THEME: Theme = "dark";

export function getTheme(): Theme {
  const current = document.documentElement.dataset.theme;
  if (current === "dark" || current === "light") return current;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" ? "light" : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // El tema sigue activo durante la sesión aunque storage no esté disponible.
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
