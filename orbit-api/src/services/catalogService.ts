/**
 * Catalog service for bulk import
 * Handles finding or creating contract_type, role, city, school, program
 */

import { Pool } from "pg";
import {
  normalizeForDedup,
  normalizeContractTypeKey,
} from "../lib/dataValidators";

export interface CatalogResult {
  id: number;
  isNew: boolean;
}

function deterministicCode(prefix: string, parts: Array<string | null>): string {
  const raw = parts
    .map((p) => (p ?? "").trim().toLowerCase())
    .join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    hash = (hash * 31 + raw.charCodeAt(i)) >>> 0;
  }
  const token = hash.toString(36).toUpperCase().padStart(6, "0");
  return `${prefix}-${token}`;
}

/**
 * Finds or creates a contract_type
 * Uses composite key: name + start_date + end_date + modality
 */
export async function findOrCreateContractType(
  pool: Pool,
  data: {
    name: string;
    startDate: string | null;
    endDate: string | null;
    workSchedule: string;
    modality: string;
  }
): Promise<CatalogResult> {
  const { name, startDate, endDate, workSchedule, modality } = data;
  const generatedCode = deterministicCode("CT", [
    name,
    startDate,
    endDate,
    workSchedule,
    modality,
  ]);

  // Generate composite key for deduplication
  const key = normalizeContractTypeKey(name, startDate, endDate, workSchedule, modality);

  try {
    // First, try to find existing by searching similar records
    const searchQuery = `
      SELECT id FROM contract_type
      WHERE LOWER(name) = LOWER($1)
        AND start_date IS NOT DISTINCT FROM $2::DATE
        AND end_date IS NOT DISTINCT FROM $3::DATE
        AND LOWER(COALESCE(modality, '')) = LOWER($4)
      LIMIT 1
    `;

    const searchResult = await pool.query(searchQuery, [
      name,
      startDate,
      endDate,
      modality,
    ]);

    if (searchResult.rows.length > 0) {
      return { id: searchResult.rows[0].id, isNew: false };
    }

    // UNIQUE(code) en core.contract_type; evita duplicados si hay carrera
    const insertQuery = `
      INSERT INTO contract_type (code, name, start_date, end_date, work_schedule, modality, is_active)
      VALUES ($1, $2, $3::DATE, $4::DATE, $5, $6, true)
      ON CONFLICT (code) DO NOTHING
      RETURNING id
    `;

    const insertResult = await pool.query(insertQuery, [
      generatedCode,
      name,
      startDate,
      endDate,
      workSchedule,
      modality,
    ]);

    if (insertResult.rows.length > 0) {
      return { id: insertResult.rows[0].id, isNew: true };
    }

    // If ON CONFLICT prevented insert, search again
    const secondSearchResult = await pool.query(searchQuery, [
      name,
      startDate,
      endDate,
      modality,
    ]);

    if (secondSearchResult.rows.length > 0) {
      return { id: secondSearchResult.rows[0].id, isNew: false };
    }

    throw new Error(`Could not find or create contract_type: ${name}`);
  } catch (error) {
    throw new Error(
      `Error in findOrCreateContractType: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Finds or creates a role
 * Uses normalized name for deduplication
 */
export async function findOrCreateRole(
  pool: Pool,
  data: {
    name: string;
    description: string;
  }
): Promise<CatalogResult> {
  const { name, description } = data;
  const normalized = normalizeForDedup(name);

  try {
    // Search for existing role by normalized name
    const searchQuery = `
      SELECT id FROM role
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
    `;

    const searchResult = await pool.query(searchQuery, [name]);

    if (searchResult.rows.length > 0) {
      return { id: searchResult.rows[0].id, isNew: false };
    }

    // Try insert without conflict target to support environments
    // where UNIQUE(name) might not exist yet.
    const insertQuery = `
      INSERT INTO role (name, description, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    const insertResult = await pool.query(insertQuery, [name, description]);

    if (insertResult.rows.length > 0) {
      return { id: insertResult.rows[0].id, isNew: true };
    }

    // Search again if insert was prevented by conflict
    const secondSearchResult = await pool.query(searchQuery, [name]);

    if (secondSearchResult.rows.length > 0) {
      return { id: secondSearchResult.rows[0].id, isNew: false };
    }

    throw new Error(`Could not find or create role: ${name}`);
  } catch (error) {
    throw new Error(
      `Error in findOrCreateRole: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Finds or creates a city
 * Uses normalized name for deduplication
 */
export async function findOrCreateCity(
  pool: Pool,
  name: string
): Promise<CatalogResult> {
  try {
    // Search for existing city by normalized name
    const searchQuery = `
      SELECT id FROM city
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
    `;

    const searchResult = await pool.query(searchQuery, [name]);

    if (searchResult.rows.length > 0) {
      return { id: searchResult.rows[0].id, isNew: false };
    }

    // Try insert without conflict target to support environments
    // where UNIQUE(name) might not exist yet.
    const insertQuery = `
      INSERT INTO city (name, is_active)
      VALUES ($1, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    const insertResult = await pool.query(insertQuery, [name]);

    if (insertResult.rows.length > 0) {
      return { id: insertResult.rows[0].id, isNew: true };
    }

    // Search again if insert was prevented by conflict
    const secondSearchResult = await pool.query(searchQuery, [name]);

    if (secondSearchResult.rows.length > 0) {
      return { id: secondSearchResult.rows[0].id, isNew: false };
    }

    throw new Error(`Could not find or create city: ${name}`);
  } catch (error) {
    throw new Error(
      `Error in findOrCreateCity: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Finds or creates a school
 * Uses normalized name for deduplication
 */
export async function findOrCreateSchool(
  pool: Pool,
  name: string,
  areaId?: number
): Promise<CatalogResult> {
  try {
    // Search for existing school by normalized name
    const searchQuery = `
      SELECT id FROM school
      WHERE LOWER(name) = LOWER($1)
      LIMIT 1
    `;

    const searchResult = await pool.query(searchQuery, [name]);

    if (searchResult.rows.length > 0) {
      const schoolId = searchResult.rows[0].id;

      // Update area_id if provided and not already set
      if (areaId) {
        await pool.query(
          `UPDATE school SET area_id = $1 WHERE id = $2 AND area_id IS NULL`,
          [areaId, schoolId]
        );
      }

      return { id: schoolId, isNew: false };
    }

    // Try insert
    const insertQuery = `
      INSERT INTO school (name, area_id, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    const insertResult = await pool.query(insertQuery, [
      name,
      areaId || null,
    ]);

    if (insertResult.rows.length > 0) {
      return { id: insertResult.rows[0].id, isNew: true };
    }

    // Search again if insert was prevented
    const secondSearchResult = await pool.query(searchQuery, [name]);

    if (secondSearchResult.rows.length > 0) {
      return { id: secondSearchResult.rows[0].id, isNew: false };
    }

    throw new Error(`Could not find or create school: ${name}`);
  } catch (error) {
    throw new Error(
      `Error in findOrCreateSchool: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Finds or creates a program
 * Uses name + school_id for deduplication
 */
export async function findOrCreateProgram(
  pool: Pool,
  name: string,
  schoolId: number
): Promise<CatalogResult> {
  try {
    // Search for existing program
    const searchQuery = `
      SELECT id FROM program
      WHERE LOWER(name) = LOWER($1) AND school_id = $2
      LIMIT 1
    `;

    const searchResult = await pool.query(searchQuery, [name, schoolId]);

    if (searchResult.rows.length > 0) {
      return { id: searchResult.rows[0].id, isNew: false };
    }

    // Try insert
    const insertQuery = `
      INSERT INTO program (name, school_id, is_active)
      VALUES ($1, $2, true)
      ON CONFLICT DO NOTHING
      RETURNING id
    `;

    const insertResult = await pool.query(insertQuery, [name, schoolId]);

    if (insertResult.rows.length > 0) {
      return { id: insertResult.rows[0].id, isNew: true };
    }

    // Search again if insert was prevented
    const secondSearchResult = await pool.query(searchQuery, [name, schoolId]);

    if (secondSearchResult.rows.length > 0) {
      return { id: secondSearchResult.rows[0].id, isNew: false };
    }

    throw new Error(`Could not find or create program: ${name}`);
  } catch (error) {
    throw new Error(
      `Error in findOrCreateProgram: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Finds or creates a hierarchy row by level.
 * For this import phase, level 5 is used as default leaf level.
 */
export async function findOrCreateHierarchyByLevel(
  pool: Pool,
  level: number
): Promise<CatalogResult> {
  try {
    const searchQuery = `
      SELECT id FROM hierarchy
      WHERE level = $1
      LIMIT 1
    `;
    const found = await pool.query(searchQuery, [level]);
    if (found.rows.length > 0) {
      return { id: found.rows[0].id, isNew: false };
    }

    const insertQuery = `
      INSERT INTO hierarchy (name, description, level)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    const fallbackName = `Nivel ${level}`;
    const inserted = await pool.query(insertQuery, [fallbackName, null, level]);
    if (inserted.rows.length > 0) {
      return { id: inserted.rows[0].id, isNew: true };
    }

    const secondSearch = await pool.query(searchQuery, [level]);
    if (secondSearch.rows.length > 0) {
      return { id: secondSearch.rows[0].id, isNew: false };
    }

    throw new Error(`Could not find or create hierarchy level: ${level}`);
  } catch (error) {
    throw new Error(
      `Error in findOrCreateHierarchyByLevel: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
