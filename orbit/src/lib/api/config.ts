const DEFAULT_API_BASE = "http://localhost:4000/api";

/** Asegura prefijo `/api` cuando solo se pasó el origen (p. ej. `https://….run.app`). */
function normalizeOrbitApiBase(raw: string | undefined, fallback: string): string {
  const s = (raw ?? "").trim();
  if (!s) return fallback;
  try {
    const u = new URL(s);
    let path = u.pathname || "/";
    path = path.replace(/\/+$/, "") || "/";
    if (path === "/") {
      return `${u.origin}/api`;
    }
    return `${u.origin}${path}`;
  } catch {
    return fallback;
  }
}

export const BASE_URL = normalizeOrbitApiBase(
  import.meta.env.VITE_API_URL as string | undefined,
  DEFAULT_API_BASE
);
