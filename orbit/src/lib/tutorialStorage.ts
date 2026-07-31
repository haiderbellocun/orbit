const ENABLED_PREFIX = "orbit_tutorial_enabled_";
const SESSION_PREFIX = "orbit_tutorial_session_";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function getTutorialUserEmail(): string | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem("orbit_user");
    if (!raw) return null;
    const user = JSON.parse(raw) as { email?: unknown };
    const email = typeof user.email === "string" ? normalizeEmail(user.email) : "";
    return email || null;
  } catch {
    return null;
  }
}

function enabledKey(email: string): string {
  return `${ENABLED_PREFIX}${normalizeEmail(email)}`;
}

function sessionKey(email: string): string {
  return `${SESSION_PREFIX}${normalizeEmail(email)}`;
}

/** Default: tutorial enabled the first time (no key stored). */
export function isTutorialEnabled(email: string | null = getTutorialUserEmail()): boolean {
  if (!email || typeof localStorage === "undefined") return true;
  const raw = localStorage.getItem(enabledKey(email));
  if (raw === null) return true;
  return raw === "true";
}

export function setTutorialEnabled(
  enabled: boolean,
  email: string | null = getTutorialUserEmail()
): void {
  if (!email || typeof localStorage === "undefined") return;
  localStorage.setItem(enabledKey(email), enabled ? "true" : "false");
}

/** Session flag lives in sessionStorage so a new browser session can show the tour again. */
export function hasTutorialShownThisSession(
  email: string | null = getTutorialUserEmail()
): boolean {
  if (!email || typeof sessionStorage === "undefined") return false;
  return sessionStorage.getItem(sessionKey(email)) === "1";
}

export function markTutorialShownThisSession(
  email: string | null = getTutorialUserEmail()
): void {
  if (!email || typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(sessionKey(email), "1");
}

export function clearTutorialSession(
  email: string | null = getTutorialUserEmail()
): void {
  if (!email || typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(sessionKey(email));
}
