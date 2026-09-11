import { BASE_URL } from "./config";
import { clearOrbitSession } from "./session";

export type PaginationMeta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type PaginatedResponse<T = unknown> = {
  data: T[];
  pagination: PaginationMeta;
  org?: unknown;
};
function withAuth(init: RequestInit = {}): RequestInit {
  const headers = new Headers(init.headers ?? undefined);
  return { ...init, headers, credentials: "include" };
}

export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, withAuth(init));
  } catch (error) {
    throw friendlyConnectionError(error);
  }
}
export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), timeoutMs);
  try {
    try {
      return await fetch(input, {
        ...withAuth(init),
        signal: controller.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw error;
      throw friendlyConnectionError(error);
    }
  } finally {
    clearTimeout(tid);
  }
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === "AbortError") ||
    (typeof error === "object" &&
      error !== null &&
      "name" in error &&
      (error as { name: string }).name === "AbortError")
  );
}
function friendlyConnectionError(error: unknown): Error {
  if (isAbortError(error)) return error as Error;
  if (error instanceof TypeError) {
    return new Error(
      "No fue posible conectarse con el servidor. Verifica tu conexión e inténtalo de nuevo."
    );
  }
  return error instanceof Error
    ? error
    : new Error("Ocurrió un error inesperado al comunicarse con el servidor.");
}

export function abortErrorMessage(timeoutMs: number): string {
  const sec = Math.round(timeoutMs / 1000);
  if (sec < 120) {
    return `La solicitud superó el tiempo de espera (${sec}s). Comprueba que la API responda y que la base de datos sea alcanzable desde Cloud Run (p. ej. conector Cloud SQL en DB_HOST).`;
  }
  const min = Math.round(timeoutMs / 60_000);
  return `La solicitud superó el tiempo de espera (${min} min). Comprueba que la API responda y la base de datos no esté bloqueada.`;
}
const HTTP_FEEDBACK: Record<number, string> = {
  400: "La solicitud contiene datos inválidos. Revisa la información e inténtalo de nuevo.",
  401: "Tu sesión expiró o no es válida. Inicia sesión nuevamente.",
  403: "No tienes permiso para realizar esta acción.",
  404: "No se encontró el recurso solicitado.",
  409: "No se pudo completar la acción porque los datos entran en conflicto con un registro existente.",
  413: "El archivo supera el tamaño permitido. Intenta con un archivo más pequeño.",
  429: "Se realizaron demasiadas solicitudes. Espera un momento e inténtalo de nuevo.",
  500: "Ocurrió un error interno en el servidor. Inténtalo de nuevo; si continúa, contacta a soporte.",
  502: "El servidor no recibió una respuesta válida de uno de sus servicios. Inténtalo de nuevo.",
  503: "El servicio no está disponible temporalmente. Inténtalo de nuevo en unos minutos.",
  504: "El servidor tardó demasiado en responder. Inténtalo de nuevo.",
};

const TECHNICAL_ERROR_MESSAGES = new Set([
  "internal server error",
  "unauthorized",
  "forbidden",
  "not found",
  "bad request",
  "service unavailable",
]);

function isTechnicalErrorMessage(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  return (
    TECHNICAL_ERROR_MESSAGES.has(normalized) ||
    normalized.startsWith("internal server error:") ||
    /^(http|error) \d{3}$/.test(normalized)
  );
}

function apiMessageFromPayload(payload: unknown): string | null {
  if (typeof payload === "string") {
    const value = payload.trim();
    if (!value || value.startsWith("<")) return null;
    return value;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const body = payload as Record<string, unknown>;
  let technicalMessage: string | null = null;
  for (const key of ["error", "message", "detail"]) {
    if (typeof body[key] === "string" && body[key].trim()) {
      const candidate = body[key].trim();
      if (!isTechnicalErrorMessage(candidate)) return candidate;
      technicalMessage ??= candidate;
    }
  }
  if (Array.isArray(body.errors)) {
    const messages = body.errors
      .map((item) =>
        typeof item === "string"
          ? item.trim()
          : typeof item === "object" && item !== null && "message" in item
            ? String((item as { message: unknown }).message).trim()
            : ""
      )
      .filter(Boolean);
    if (messages.length) return messages.join(" ");
  }
  return technicalMessage;
}

function translateKnownApiMessage(message: string): string {
  const exact: Record<string, string> = {
    "Invalid id": "El identificador enviado no es válido.",
    "Invalid area_id": "El área seleccionada no es válida.",
    "Invalid areaId": "El área seleccionada no es válida.",
    "Invalid school_id": "La escuela seleccionada no es válida.",
    "Invalid schoolId": "La escuela seleccionada no es válida.",
    "Invalid programId": "El programa seleccionado no es válido.",
    "Invalid operationStatus": "El estado operativo seleccionado no es válido.",
    "Invalid closedAt": "La fecha de cierre no es válida.",
    "Invalid sentToCapitalAt": "La fecha de envío a Capital Humano no es válida.",
    "School not found": "No se encontró la escuela seleccionada.",
    "School not found or inactive": "La escuela seleccionada no existe o está inactiva.",
    "programId not found or inactive": "El programa seleccionado no existe o está inactivo.",
    "Vacancy not found": "No se encontró la vacante solicitada.",
    "Requisition not found for this vacancy": "La vacante no tiene una requisición asociada.",
    "email is required": "El correo electrónico es obligatorio.",
    "areaId is required": "El área es obligatoria.",
    "positionName is required": "El nombre del cargo es obligatorio.",
    "positionName cannot be empty": "El nombre del cargo no puede estar vacío.",
    "text is required": "Escribe un comentario antes de continuar.",
    "quantity must be a positive number": "La cantidad debe ser mayor que cero.",
    "No fields to update": "No hay cambios para guardar.",
    "CORE catalog is not available": "El catálogo de personal no está disponible temporalmente.",
  };
  return exact[message] ?? message;
}

async function responseErrorMessage(response: Response): Promise<string> {
  const fallback =
    HTTP_FEEDBACK[response.status] ??
    (response.status >= 500
      ? HTTP_FEEDBACK[500]
      : `No se pudo completar la solicitud (código ${response.status}).`);
  const text = await response.text().catch(() => "");
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // Las respuestas de proxies pueden ser texto o HTML.
  }
  const apiMessage = apiMessageFromPayload(payload);
  if (!apiMessage || isTechnicalErrorMessage(apiMessage)) {
    return fallback;
  }
  return translateKnownApiMessage(apiMessage);
}

export async function assertResponseOk(response: Response): Promise<void> {
  if (response.status === 401) {
    clearOrbitSession();
  }
  if (!response.ok) {
    throw new Error(await responseErrorMessage(response));
  }
}

export async function handleJson<T>(response: Response): Promise<T> {
  await assertResponseOk(response);
  return response.json() as Promise<T>;
}

export const jsonHeaders = { "Content-Type": "application/json" };

/**
 * Construye un query string omitiendo `undefined`, `null` y cadenas vacías.
 * Los booleanos se serializan como `"true"`/`"false"`; para banderas que la API
 * espera como `1`, usa {@link flag}.
 */
export function buildQuery(params: Record<string, unknown>): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    qs.set(key, String(value));
  }
  const s = qs.toString();
  return s ? `?${s}` : "";
}

/** Bandera booleana que la API lee como `1` (ausente cuando es falsa). */
export function flag(value: unknown): "1" | undefined {
  return value ? "1" : undefined;
}

/** `${BASE_URL}${path}` con query string ya normalizado. */
export function apiUrl(path: string, params?: Record<string, unknown>): string {
  return `${BASE_URL}${path}${params ? buildQuery(params) : ""}`;
}
