export type Theme = "dark" | "light";

const STORAGE_KEY = "orbit_theme";

/** Orbit ships in Orbit Night; the toggle opts back into Orbit Day. */
export const DEFAULT_THEME: Theme = "dark";

export function getStoredTheme(): Theme | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "dark" || raw === "light" ? raw : null;
  } catch {
    return null;
  }
}

export function getTheme(): Theme {
  const root = document.documentElement.dataset.theme;
  if (root === "dark" || root === "light") return root;
  return getStoredTheme() ?? DEFAULT_THEME;
}

/** Paints the theme by setting the attribute the CSS token blocks key off. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable (private mode): the theme still applies this session */
  }
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
