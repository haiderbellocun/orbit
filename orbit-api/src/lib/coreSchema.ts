import { pool } from "../db/connection";

export type CoreSchemaMode = "public" | "core";

/**
 * Detects whether area/school/program live in `core` or legacy `public`.
 */
export async function resolveCoreSchemaMode(): Promise<CoreSchemaMode | null> {
  const preferred = (process.env.DB_SCHEMA ?? "").trim().toLowerCase();
  const result = await pool.query(
    `SELECT
       to_regclass('public.area') AS area_public,
       to_regclass('core.area') AS area_core,
       to_regclass('public.school') AS school_public,
       to_regclass('core.school') AS school_core,
       to_regclass('public.program') AS program_public,
       to_regclass('core.program') AS program_core`
  );
  const row = result.rows[0] as
    | {
        area_public?: string | null;
        area_core?: string | null;
        school_public?: string | null;
        school_core?: string | null;
        program_public?: string | null;
        program_core?: string | null;
      }
    | undefined;
  if (preferred === "core" && row?.area_core && row?.school_core && row?.program_core)
    return "core";
  if (row?.area_public && row?.school_public && row?.program_public) return "public";
  if (row?.area_core && row?.school_core && row?.program_core) return "core";
  return null;
}

export function qualifiedCoreTable(mode: CoreSchemaMode, table: string): string {
  const prefix = mode === "core" ? "core." : "public.";
  return `${prefix}${table}`;
}
