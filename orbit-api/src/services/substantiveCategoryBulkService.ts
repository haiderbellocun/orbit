import { Pool } from "pg";
import { truncateUtf } from "../lib/stringTruncate";

export interface CategoryUpsertResult {
  id: number | null;
  isNew: boolean;
}

export async function upsertCategory(
  pool: Pool,
  name: string
): Promise<CategoryUpsertResult> {
  const safeName = truncateUtf(name, 200) ?? "";
  const found = await pool.query(
    `SELECT id
     FROM substantive_hours.category
     WHERE LOWER(name) = LOWER($1)
     LIMIT 1`,
    [safeName]
  );
  if (found.rows.length > 0) {
    return { id: found.rows[0].id as number, isNew: false };
  }

  const inserted = await pool.query(
    `INSERT INTO substantive_hours.category (name)
     VALUES ($1)
     RETURNING id`,
    [safeName]
  );

  return {
    id: inserted.rows[0]?.id ?? null,
    isNew: true,
  };
}
