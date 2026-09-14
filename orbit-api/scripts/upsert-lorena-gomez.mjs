import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const APPLY = process.argv.includes("--apply");
const TARGET = {
  document: "1000626221",
  fullName: "LORENA GOMEZ BAEZ",
  email: "lorena_gomez@cun.edu.co",
};
const TEMPLATE_EMAILS = [
  "sara_murillofo@cun.edu.co",
  "cindy_russi@cun.edu.co",
];
const COPIED_COLUMNS = [
  "contract_type_id",
  "area_id",
  "school_id",
  "program_id",
  "hierarchy_id",
  "hierarchy_temp_id",
  "role_id",
  "manager_id",
];

const sslFlag = String(process.env.DB_SSL ?? "").trim().toLowerCase();
const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
const ssl =
  sslFlag === "true" || sslFlag === "1"
    ? { rejectUnauthorized: false }
    : host && host !== "localhost" && host !== "127.0.0.1"
      ? { rejectUnauthorized: false }
      : undefined;

const schema = (process.env.DB_SCHEMA ?? "core").trim();
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  ssl,
  options: `-c search_path=${schema},public`,
});

const client = await pool.connect();
try {
  await client.query("BEGIN");
  const templates = await client.query(
    `SELECT p.*, r.name AS role_name
       FROM person p
       LEFT JOIN role r ON r.id = p.role_id
      WHERE LOWER(COALESCE(p.edu_email, p.email, '')) = ANY($1::text[])
      ORDER BY ARRAY_POSITION($1::text[], LOWER(COALESCE(p.edu_email, p.email, '')))`,
    [TEMPLATE_EMAILS]
  );
  if (templates.rows.length !== TEMPLATE_EMAILS.length) {
    throw new Error("No se encontraron las plantillas de Sara y Cindy");
  }

  const [template, comparison] = templates.rows;
  const differences = COPIED_COLUMNS.filter(
    (column) => template[column] !== comparison[column]
  );
  if (differences.length > 0) {
    throw new Error(
      `Sara y Cindy no tienen el mismo cargo/estructura: ${differences.join(", ")}`
    );
  }

  const existing = await client.query(
    `SELECT id FROM person
      WHERE document = $1
         OR LOWER(COALESCE(edu_email, '')) = LOWER($2)
         OR LOWER(COALESCE(email, '')) = LOWER($2)
      LIMIT 1`,
    [TARGET.document, TARGET.email]
  );

  const values = COPIED_COLUMNS.map((column) => template[column]);
  let result;
  if (existing.rows.length > 0) {
    result = await client.query(
      `UPDATE person
          SET document = $1, full_name = $2, edu_email = $3,
              contract_type_id = $4, area_id = $5, school_id = $6,
              program_id = $7, hierarchy_id = $8, hierarchy_temp_id = $9,
              role_id = $10, manager_id = $11, is_active = true, updated_at = NOW()
        WHERE id = $12
        RETURNING id, document, full_name, edu_email, area_id, school_id,
                  program_id, role_id, hierarchy_id, manager_id, is_active`,
      [TARGET.document, TARGET.fullName, TARGET.email, ...values, existing.rows[0].id]
    );
  } else {
    result = await client.query(
      `INSERT INTO person (
         document, full_name, edu_email, contract_type_id, area_id, school_id,
         program_id, hierarchy_id, hierarchy_temp_id, role_id, manager_id,
         is_active, created_at, updated_at
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, NOW(), NOW())
       RETURNING id, document, full_name, edu_email, area_id, school_id,
                 program_id, role_id, hierarchy_id, manager_id, is_active`,
      [TARGET.document, TARGET.fullName, TARGET.email, ...values]
    );
  }

  console.log(JSON.stringify({
    mode: APPLY ? "apply" : "dry-run",
    templateRole: template.role_name,
    person: result.rows[0],
  }, null, 2));

  if (APPLY) {
    await client.query("COMMIT");
  } else {
    await client.query("ROLLBACK");
  }
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
