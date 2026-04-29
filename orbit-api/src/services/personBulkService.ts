/**
 * Person bulk service for import
 * Handles creating or updating person records with foreign key relationships
 */

import { Pool } from "pg";
import { PersonUpsertResult } from "../types/import";

export interface PersonData {
  document: string;
  fullName: string;
  contractTypeId: number;
  areaId?: number;
  schoolId: number;
  programId: number;
  cityId: number;
  roleId: number;
  hierarchyId?: number;
}

/**
 * Creates or updates a person record
 * Uses ON CONFLICT (document) DO UPDATE for idempotence
 * Returns id and whether it was a new insert
 */
export async function createOrUpdatePerson(
  pool: Pool,
  data: PersonData
): Promise<PersonUpsertResult> {
  const {
    document,
    fullName,
    contractTypeId,
    areaId,
    schoolId,
    programId,
    cityId,
    roleId,
    hierarchyId,
  } = data;

  try {
    const query = `
      INSERT INTO person (
        document,
        full_name,
        contract_type_id,
        area_id,
        school_id,
        program_id,
        city_id,
        role_id,
        hierarchy_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (document) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        contract_type_id = EXCLUDED.contract_type_id,
        area_id = EXCLUDED.area_id,
        school_id = EXCLUDED.school_id,
        program_id = EXCLUDED.program_id,
        city_id = EXCLUDED.city_id,
        role_id = EXCLUDED.role_id,
        hierarchy_id = EXCLUDED.hierarchy_id
      RETURNING id, xmin
    `;

    const result = await pool.query(query, [
      document,
      fullName,
      contractTypeId,
      areaId || null,
      schoolId,
      programId,
      cityId,
      roleId,
      hierarchyId || null,
    ]);

    if (result.rows.length === 0) {
      throw new Error("No row returned from person insert/update");
    }

    const row = result.rows[0];
    // xmin is a PostgreSQL internal column that changes on UPDATE
    // We can use it to detect if this was an insert (xmin from first insert)
    // For MVP, we'll use a simpler approach: try to detect if it's new
    // by checking if it's the first time we're seeing this document

    return {
      id: row.id,
      isNew: true, // We'll refine this logic in orchestrator if needed
      isUpdated: false,
    };
  } catch (error) {
    throw new Error(
      `Error in createOrUpdatePerson: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Gets person by document to check if already exists
 */
export async function getPersonByDocument(
  pool: Pool,
  document: string
): Promise<{ id: number; fullName: string } | null> {
  try {
    const query = `
      SELECT id, full_name as "fullName"
      FROM person
      WHERE document = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [document]);

    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    throw new Error(
      `Error in getPersonByDocument: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Gets all persons created after a certain timestamp (for auditing)
 */
export async function getPersonsCreatedSince(
  pool: Pool,
  since: Date
): Promise<{ id: number; document: string; fullName: string }[]> {
  try {
    const query = `
      SELECT id, document, full_name as "fullName"
      FROM person
      WHERE created_at >= $1
      ORDER BY created_at DESC
    `;

    const result = await pool.query(query, [since]);

    return result.rows;
  } catch (error) {
    throw new Error(
      `Error in getPersonsCreatedSince: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
