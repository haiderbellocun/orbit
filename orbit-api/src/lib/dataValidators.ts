/**
 * Data validators and normalizers for Excel import
 */

/**
 * Converts Excel serial number (date) to ISO format string (YYYY-MM-DD)
 * Reuses pattern from seed.ts
 */
export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null;

  try {
    // Excel epoch is January 1, 1900
    // JavaScript epoch is January 1, 1970
    // Difference is 25569 days
    const ms = (serial - 25569) * 86400 * 1000;
    const d = new Date(ms);

    if (Number.isNaN(d.getTime())) return null;

    const y = d.getUTCFullYear();
    // Validate reasonable date range
    if (y < 1950 || y > 2100) return null;

    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Converts various date formats to ISO string (YYYY-MM-DD)
 * Handles Excel serial dates, Date objects, and string parsing
 */
export function toDateString(val: unknown): string | null {
  if (val === null || val === undefined || val === "") return null;

  // If it's a Date object
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, "0");
    const d = String(val.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // If it's a number (Excel serial date)
  if (typeof val === "number") {
    return excelSerialToIso(val);
  }

  // If it's a string, try to parse it
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (!trimmed) return null;

    // Try parsing as ISO format
    const isoMatch = trimmed.match(/^\d{4}-\d{2}-\d{2}$/);
    if (isoMatch) {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) return trimmed;
    }

    // Try parsing other common formats
    try {
      const d = new Date(trimmed);
      if (!Number.isNaN(d.getTime())) {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      }
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validates and normalizes document (identification) value
 * Returns cleaned document string or null if invalid
 */
export function validateDocument(val: unknown): string | null {
  if (val === null || val === undefined) return null;

  let str = "";

  if (typeof val === "number") {
    str = String(val);
  } else if (typeof val === "string") {
    str = val;
  } else {
    return null;
  }

  const trimmed = str.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Validates and concatenates first and last names
 * Returns full name or null if both are missing
 */
export function validateFullName(
  firstName: unknown,
  lastName: unknown
): string | null {
  const first = toString(firstName);
  const last = toString(lastName);

  if (!first && !last) return null;

  return `${first} ${last}`.trim() || null;
}

/**
 * Converts value to trimmed string or null if empty
 */
export function toString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return String(val);
  return String(val).trim();
}

/**
 * Normalizes string for deduplication (lowercase + trim)
 */
export function normalizeForDedup(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Validates that a value is non-empty string
 * Returns trimmed string or null
 */
export function validateNonEmpty(val: unknown): string | null {
  const str = toString(val);
  return str.length > 0 ? str : null;
}

/**
 * Generates unique key for contract_type based on:
 * name, start_date, end_date, work_schedule, modality
 * Used to detect duplicate contract types
 */
export function normalizeContractTypeKey(
  name: string,
  startDate: string | null,
  endDate: string | null,
  workSchedule: string,
  modality: string
): string {
  const normalized = [
    normalizeForDedup(name),
    startDate || "null",
    endDate || "null",
    normalizeForDedup(workSchedule),
    normalizeForDedup(modality),
  ].join("|");

  return normalized;
}

/**
 * Validates that required fields are present in normalized record
 * Returns array of validation errors or empty array if valid
 */
export function validateNormalizedRecord(record: {
  document?: string;
  fullName?: string;
  rowNumber?: number;
}): string[] {
  const errors: string[] = [];

  if (!record.document) {
    errors.push("Documento (Identificación) es requerido");
  }

  if (!record.fullName) {
    errors.push("Nombres y Apellidos son requeridos");
  }

  return errors;
}
