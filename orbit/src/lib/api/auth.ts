import { BASE_URL } from "./config";
import {
  abortErrorMessage,
  authFetch,
  fetchWithTimeout,
  handleJson,
  isAbortError,
  jsonHeaders,
} from "./http";
import { clearOrbitSession, type GoogleAuthResponse } from "./session";

/** Login sin JWT previo: timeout acotado para no quedar en spinner infinito si la API/DB cuelgan. */
const AUTH_LOGIN_TIMEOUT_MS = 60_000;

export async function logoutOrbitSession(): Promise<void> {
  clearOrbitSession();
  await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  }).catch(() => undefined);
}

export async function getCurrentOrbitSession(): Promise<GoogleAuthResponse | null> {
  const response = await authFetch(`${BASE_URL}/auth/session`);
  if (response.status === 401) return null;
  return handleJson<GoogleAuthResponse>(response);
}

/** POST de login con timeout: un abort se reporta como tiempo de espera agotado. */
async function postLogin(
  path: string,
  body: Record<string, unknown>
): Promise<GoogleAuthResponse> {
  try {
    const response = await fetchWithTimeout(
      `${BASE_URL}${path}`,
      { method: "POST", headers: jsonHeaders, body: JSON.stringify(body) },
      AUTH_LOGIN_TIMEOUT_MS
    );
    return handleJson<GoogleAuthResponse>(response);
  } catch (error: unknown) {
    if (isAbortError(error)) {
      throw new Error(abortErrorMessage(AUTH_LOGIN_TIMEOUT_MS));
    }
    throw error;
  }
}

export function loginWithGoogleIdToken(
  idToken: string
): Promise<GoogleAuthResponse> {
  return postLogin("/auth/google", { idToken });
}

/** Solo para desarrollo local: mismo JWT que Google, sin idToken. */
export function loginWithLocalEmail(email: string): Promise<GoogleAuthResponse> {
  return postLogin("/auth/local-email", { email: email.trim() });
}
