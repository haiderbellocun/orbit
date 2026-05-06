import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const { Pool } = pg;

const portRaw = Number.parseInt(process.env.DB_PORT ?? "5432", 10);
const schema = (process.env.DB_SCHEMA ?? "public").trim() || "public";

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number.isNaN(portRaw) ? 5432 : portRaw,
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  ssl: undefined,
  options: `-c search_path=${schema},public`,
});

function corePrefixFrom(row) {
  if (row?.person_core) return "core.";
  if (row?.person_public) return "";
  return null;
}

async function main() {
  const reg = await pool.query(
    `SELECT
       to_regclass('person') AS person_public,
       to_regclass('core.person') AS person_core,
       to_regclass('role') AS role_public,
       to_regclass('core.role') AS role_core`
  );
  console.log("to_regclass:", reg.rows[0]);

  const prefix = corePrefixFrom(reg.rows[0]);
  if (prefix == null) {
    console.log("No person table found (neither person nor core.person).");
    return;
  }

  const qLevel = `
    SELECT COUNT(*)::int AS n
    FROM ${prefix}person p
    LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
    WHERE h.level = 3
  `;
  const level3 = await pool.query(qLevel);
  console.log("level=3 persons:", level3.rows[0]);

  const qAreas = `
    SELECT a.name, COUNT(*)::int AS n
    FROM ${prefix}person p
    LEFT JOIN ${prefix}school s ON s.id = p.school_id
    LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
    LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
    WHERE h.level = 3
    GROUP BY a.name
    ORDER BY n DESC NULLS LAST
    LIMIT 20
  `;
  const areas = await pool.query(qAreas);
  console.log("top areas (level=3):", areas.rows);

  const qRoles = `
    SELECT r.code, r.name, r.category, COUNT(*)::int AS n
    FROM ${prefix}person p
    LEFT JOIN ${prefix}role r ON r.id = p.role_id
    LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
    WHERE h.level = 3
    GROUP BY r.code, r.name, r.category
    ORDER BY n DESC NULLS LAST
    LIMIT 20
  `;
  const roles = await pool.query(qRoles);
  console.log("top roles (level=3):", roles.rows);

  const qExpected = `
    SELECT COUNT(*)::int AS n
    FROM ${prefix}person p
    LEFT JOIN ${prefix}school s ON s.id = p.school_id
    LEFT JOIN ${prefix}area a ON a.id = COALESCE(p.area_id, s.area_id)
    LEFT JOIN ${prefix}hierarchy h ON h.id = p.hierarchy_id
    LEFT JOIN ${prefix}role r ON r.id = p.role_id
    WHERE h.level = 3
      AND (
        a.name ILIKE '%ÁREA ACÁDEMICA%' OR
        a.name ILIKE '%AREA ACADEMICA%' OR
        a.name ILIKE '%ACÁDEMICA%' OR
        a.name ILIKE '%ACADEMICA%'
      )
      AND (LOWER(COALESCE(r.category, r.name, r.code, '')) LIKE '%acad%')
  `;
  const expected = await pool.query(qExpected);
  console.log("matches current API filters:", expected.rows[0]);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => {});
  });

