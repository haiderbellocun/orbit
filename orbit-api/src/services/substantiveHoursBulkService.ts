import { Pool } from "pg";
import { truncateUtf } from "../lib/stringTruncate";

export interface ProjectUpsertResult {
  id: number | null;
  isNew: boolean;
}

export interface SubstantiveFunctionUpsertResult {
  id: number | null;
  isNew: boolean;
  hoursQuantity: number | null;
}

export async function upsertProject(
  pool: Pool,
  name: string
): Promise<ProjectUpsertResult> {
  const safeName = truncateUtf(name, 200) ?? "";
  const found = await pool.query(
    `SELECT id
     FROM substantive_hours.project
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [safeName]
  );
  if (found.rows.length > 0) {
    return { id: found.rows[0].id as number, isNew: false };
  }

  const inserted = await pool.query(
    `INSERT INTO substantive_hours.project (name)
     VALUES ($1)
     RETURNING id`,
    [safeName]
  );

  return {
    id: inserted.rows[0]?.id ?? null,
    isNew: true,
  };
}

export async function upsertSubstantiveFunction(
  pool: Pool,
  projectId: number,
  hoursQuantity: number | null,
  observations: string | null
): Promise<SubstantiveFunctionUpsertResult> {
  const safeHoursQuantity = hoursQuantity ?? 0;
  const found = await pool.query(
    `SELECT id, hours_quantity
     FROM substantive_hours.substantive_function
     WHERE project_id = $1
     LIMIT 1`,
    [projectId]
  );
  if (found.rows.length > 0) {
    const existingId = found.rows[0].id as number;
    await pool.query(
      `UPDATE substantive_hours.substantive_function
       SET
         hours_quantity = $1,
         observations = COALESCE($2, observations)
       WHERE id = $3`,
      [safeHoursQuantity, observations, existingId]
    );
    return {
      id: existingId,
      isNew: false,
      hoursQuantity: safeHoursQuantity,
    };
  }

  const inserted = await pool.query(
    `INSERT INTO substantive_hours.substantive_function (
      project_id, hours_quantity, observations
    ) VALUES ($1, $2, $3)
    RETURNING id`,
    [projectId, safeHoursQuantity, observations]
  );

  return {
    id: inserted.rows[0]?.id ?? null,
    isNew: true,
    hoursQuantity: safeHoursQuantity,
  };
}
