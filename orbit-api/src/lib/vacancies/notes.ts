import { pool } from "../../db/connection";
import { qualifiedCoreTable, type CoreSchemaMode } from "../coreSchema";
import { mapOperationNoteRow, type VacancyOperationNoteDto } from "./mappers";

export async function insertOperationNote(
  vacancyId: string,
  body: string,
  createdByPersonId: number | null
): Promise<Record<string, unknown>> {
  const { rows } = await pool.query(
    `INSERT INTO vacancies.vacancy_operation_note
        (vacancy_id, body, created_by_person_id)
       VALUES ($1, $2, $3)
       RETURNING id, body, created_at, created_by_person_id`,
    [vacancyId, body, createdByPersonId]
  );
  return rows[0] as Record<string, unknown>;
}

export async function loadPersonFullName(
  mode: CoreSchemaMode,
  personId: number
): Promise<string | null> {
  const { rows } = await pool.query(
    `SELECT full_name FROM ${qualifiedCoreTable(mode, "person")} WHERE id = $1`,
    [personId]
  );
  if (rows.length === 0) return null;
  const name = String((rows[0] as { full_name?: unknown }).full_name ?? "");
  return name.trim() === "" ? null : name;
}

/**
 * Notas de una vacante.
 *
 * Una base sin la tabla (o sin el join a persona) devuelve lista vacía en vez
 * de tumbar la respuesta completa.
 */
export async function loadOperationNotesForVacancy(
  vacancyId: string,
  mode: CoreSchemaMode
): Promise<VacancyOperationNoteDto[]> {
  try {
    const { rows } = await pool.query(
      `SELECT
         n.id,
         n.body,
         n.created_at,
         n.created_by_person_id,
         per.full_name AS created_by_name
       FROM vacancies.vacancy_operation_note n
       LEFT JOIN ${qualifiedCoreTable(mode, "person")} per
         ON per.id = n.created_by_person_id
       WHERE n.vacancy_id = $1
       ORDER BY n.created_at ASC`,
      [vacancyId]
    );
    return rows.map((r) => mapOperationNoteRow(r as Record<string, unknown>));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42P01" || code === "42703") {
      console.warn(
        "vacancy_operation_note / person join: returning empty notes.",
        e
      );
      return [];
    }
    throw e;
  }
}
