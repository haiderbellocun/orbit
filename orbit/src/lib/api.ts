/**
 * Punto de entrada del cliente HTTP de Orbit.
 *
 * La implementación vive en `lib/api/*`, un módulo por dominio del API. Este
 * barrel conserva la superficie pública (`@/src/lib/api`) para las vistas.
 */
export { BASE_URL } from "./api/config";
export {
  apiUrl,
  buildQuery,
  flag,
  type PaginatedResponse,
  type PaginationMeta,
} from "./api/http";
export {
  clearOrbitSession,
  getStoredCapabilities,
  getStoredOrbitAccess,
  getStoredPlantaActivaAccess,
  getStoredSessionExpiresAt,
  getStoredUserEmail,
  isStoredJwtValid,
  persistOrbitSession,
  ORBIT_JWT_STORAGE_KEY,
  ORBIT_USER_STORAGE_KEY,
  type AuthUser,
  type GoogleAuthResponse,
  type OrbitAccess,
} from "./api/session";
export {
  getCurrentOrbitSession,
  loginWithGoogleIdToken,
  loginWithLocalEmail,
  logoutOrbitSession,
} from "./api/auth";
export * from "./api/vacancies";
export * from "./api/notifications";
export * from "./api/planta";
export * from "./api/reinstatements";
export * from "./api/catalog";
export * from "./api/roles";
export * from "./api/academicLoad";
export * from "./api/substantiveHours";
export * from "./api/dashboard";
export * from "./api/workforceEvents";
