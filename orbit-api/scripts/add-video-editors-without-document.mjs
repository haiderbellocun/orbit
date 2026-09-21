import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const APPLY = process.argv.includes("--apply");
const schema = (process.env.DB_SCHEMA ?? "core").trim();
const sslFlag = String(process.env.DB_SSL ?? "").trim().toLowerCase();
const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
const ssl =
  sslFlag === "true" || sslFlag === "1"
    ? { rejectUnauthorized: false }
    : host && host !== "localhost" && host !== "127.0.0.1"
      ? { rejectUnauthorized: false }
      : undefined;

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl,
  options: `-c search_path=${schema},public`,
});

const PEOPLE = [
  ["KAREN STEPHANIE SUPELANO CORTES", "karen_supelano@cun.edu.co"],
  ["YENIFER LORENA ARIAS SOSA", "yenifer_arias@cun.edu.co"],
  ["CARLOS ANDRES GAMEZ OSPINA", "carlos_gamez@cun.edu.co"],
];

const client = await pool.connect();
try {
  await client.query("BEGIN");

  const one = async (sql, values, label) => {
    const result = await client.query(sql, values);
    if (result.rows.length !== 1) {
      throw new Error(`${label}: se esperó exactamente una coincidencia y se encontraron ${result.rows.length}`);
    }
    return result.rows[0];
  };

  const area = await one(
    `SELECT id, name FROM area WHERE UPPER(TRIM(name)) = 'FABRICA Y DESARROLLO'`,
    [],
    "Área FABRICA Y DESARROLLO"
  );
  const school = await one(
    `SELECT id, name, area_id FROM school
     WHERE area_id = $1
       AND UPPER(TRIM(name)) = 'PRODUCCION AUDIOVISUAL DE CONTENIDO (EDITORES Y PRESENTADORAS)'`,
    [area.id],
    "Escuela PRODUCCION AUDIOVISUAL DE CONTENIDO"
  );
  const role = await one(
    `SELECT id, name FROM role WHERE UPPER(TRIM(name)) = 'EDITOR DE VIDEOS'`,
    [],
    "Rol EDITOR DE VIDEOS"
  );

  const results = [];
  for (const [fullName, eduEmail] of PEOPLE) {
    const existing = await client.query(
      `SELECT id, full_name, document, edu_email, area_id, school_id, program_id, role_id, is_active
       FROM person
       WHERE LOWER(COALESCE(edu_email, '')) = LOWER($1)`,
      [eduEmail]
    );
    if (existing.rows.length > 0) {
      results.push({ action: "skip_exists", person: existing.rows[0] });
      continue;
    }

    if (!APPLY) {
      results.push({
        action: "dry_run_create",
        person: {
          full_name: fullName,
          document: null,
          edu_email: eduEmail,
          area_id: area.id,
          school_id: school.id,
          program_id: null,
          role_id: role.id,
          is_active: true,
        },
      });
      continue;
    }

    const inserted = await client.query(
      `INSERT INTO person (
         full_name, document, edu_email,
         area_id, school_id, program_id, role_id,
         is_active, created_at, updated_at
       ) VALUES ($1, NULL, $2, $3, $4, NULL, $5, true, NOW(), NOW())
       RETURNING id, full_name, document, edu_email, area_id, school_id, program_id, role_id, is_active`,
      [fullName, eduEmail, area.id, school.id, role.id]
    );
    results.push({ action: "created", person: inserted.rows[0] });
  }

  console.log(JSON.stringify({ area, school, role, results }, null, 2));
  if (APPLY) {
    await client.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await client.query("ROLLBACK");
    console.log("DRY-RUN rolled back (no changes). Re-run with --apply to write.");
  }
} catch (error) {
  await client.query("ROLLBACK");
  console.error(error);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
