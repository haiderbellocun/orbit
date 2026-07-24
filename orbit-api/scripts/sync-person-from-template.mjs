import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const sslFlag = (process.env.DB_SSL ?? "").trim().toLowerCase();
const ssl =
  sslFlag === "true" || sslFlag === "1"
    ? {
        rejectUnauthorized:
          (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
          "true",
      }
    : undefined;
const schema = (process.env.DB_SCHEMA ?? "core").trim();
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl,
  options: `-c search_path=${schema},public`,
});

const TEMPLATE_EMAIL = "angie_ruizm@cun.edu.co";
const TARGET_EMAIL = "sara_murillofo@cun.edu.co";

const main = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const template = await client.query(
      `
      SELECT id, area_id, role_id, hierarchy_id, school_id, program_id, contract_type_id, city_id
      FROM person
      WHERE LOWER(COALESCE(edu_email, '')) = LOWER($1)
         OR LOWER(COALESCE(email, '')) = LOWER($1)
      LIMIT 1
      `,
      [TEMPLATE_EMAIL]
    );
    if (template.rows.length === 0) {
      throw new Error(`Plantilla no encontrada: ${TEMPLATE_EMAIL}`);
    }
    const src = template.rows[0];

    const updated = await client.query(
      `
      UPDATE person target
      SET
        area_id = $2,
        role_id = $3,
        hierarchy_id = $4,
        school_id = $5,
        program_id = $6,
        contract_type_id = $7,
        city_id = $8,
        updated_at = NOW()
      WHERE LOWER(COALESCE(target.edu_email, '')) = LOWER($1)
         OR LOWER(COALESCE(target.email, '')) = LOWER($1)
      RETURNING id, full_name, edu_email, area_id, role_id, hierarchy_id
      `,
      [
        TARGET_EMAIL,
        src.area_id,
        src.role_id,
        src.hierarchy_id,
        src.school_id,
        src.program_id,
        src.contract_type_id,
        src.city_id,
      ]
    );

    if (updated.rows.length === 0) {
      throw new Error(`Persona destino no encontrada: ${TARGET_EMAIL}`);
    }

    await client.query("COMMIT");
    console.log(
      JSON.stringify(
        { template: src, updated: updated.rows[0] },
        null,
        2
      )
    );
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
