import dotenv from "dotenv";
import pg from "pg";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const APPLY = process.argv.includes("--apply");

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

const AREA_FABRICA = 2;
const ROLE_GIF_HUMANIDADES = 72;
const SCHOOL_CREACION_CONTENIDOS = 2;
const HIERARCHY_NIVEL_5 = 5;

const PEOPLE = [
  {
    full_name: "ANGIE STEFANY VERA MEDINA",
    edu_email: "angie_vera@cun.edu.co",
    role_name: "ESTADISTICO MULTIVARIADO",
    school: "DATOS",
    note: "nueva escuela DATOS",
  },
  {
    full_name: "CAROLINA HERRERA RINCÓN",
    edu_email: "carolina_herrerar@cun.edu.co",
    role_id: ROLE_GIF_HUMANIDADES,
    school_id: SCHOOL_CREACION_CONTENIDOS,
    note: "GIF → CREACION DE CONTENIDOS ACADEMICOS",
  },
];

const client = await pool.connect();
try {
  await client.query("BEGIN");

  // 1) Escuela DATOS
  let schoolDatos = await client.query(
    `SELECT id, name, area_id FROM school
     WHERE area_id = $1 AND UPPER(TRIM(name)) = 'DATOS'
     LIMIT 1`,
    [AREA_FABRICA]
  );
  if (schoolDatos.rows.length === 0) {
    if (APPLY) {
      schoolDatos = await client.query(
        `INSERT INTO school (name, area_id, is_active, is_operative, created_at, updated_at)
         VALUES ('DATOS', $1, true, false, NOW(), NOW())
         RETURNING id, name, area_id`,
        [AREA_FABRICA]
      );
      console.log("CREATED school:", schoolDatos.rows[0]);
    } else {
      console.log("DRY-RUN would create school DATOS under area", AREA_FABRICA);
    }
  } else {
    console.log("EXISTS school:", schoolDatos.rows[0]);
  }
  const datosId = schoolDatos.rows[0]?.id ?? null;

  // 2) Rol ESTADISTICO MULTIVARIADO
  let roleEstad = await client.query(
    `SELECT id, name FROM role
     WHERE UPPER(TRIM(name)) = 'ESTADISTICO MULTIVARIADO'
     LIMIT 1`
  );
  if (roleEstad.rows.length === 0) {
    if (APPLY) {
      roleEstad = await client.query(
        `INSERT INTO role (name, is_active, created_at, updated_at)
         VALUES ('ESTADISTICO MULTIVARIADO', true, NOW(), NOW())
         RETURNING id, name`
      );
      console.log("CREATED role:", roleEstad.rows[0]);
    } else {
      console.log("DRY-RUN would create role ESTADISTICO MULTIVARIADO");
    }
  } else {
    console.log("EXISTS role:", roleEstad.rows[0]);
  }
  const roleEstadId = roleEstad.rows[0]?.id ?? null;

  const results = [];

  for (const p of PEOPLE) {
    const existing = await client.query(
      `SELECT id, full_name, edu_email, area_id, school_id, role_id, is_active
       FROM person
       WHERE LOWER(COALESCE(edu_email, '')) = LOWER($1)
       LIMIT 1`,
      [p.edu_email]
    );
    if (existing.rows.length > 0) {
      results.push({ action: "skip_exists", person: existing.rows[0] });
      continue;
    }

    const schoolId =
      p.school === "DATOS" ? datosId : (p.school_id ?? null);
    const roleId =
      p.role_name === "ESTADISTICO MULTIVARIADO"
        ? roleEstadId
        : (p.role_id ?? null);

    if (APPLY && (schoolId == null || roleId == null)) {
      throw new Error(
        `Faltan ids para ${p.full_name}: school=${schoolId} role=${roleId}`
      );
    }

    if (APPLY) {
      const inserted = await client.query(
        `INSERT INTO person (
           full_name, edu_email,
           area_id, school_id, role_id, hierarchy_id,
           is_active, created_at, updated_at
         ) VALUES (
           $1, $2,
           $3, $4, $5, $6,
           true, NOW(), NOW()
         )
         RETURNING id, full_name, edu_email, area_id, school_id, role_id, hierarchy_id, is_active`,
        [
          p.full_name,
          p.edu_email,
          AREA_FABRICA,
          schoolId,
          roleId,
          HIERARCHY_NIVEL_5,
        ]
      );
      results.push({ action: "created", note: p.note, person: inserted.rows[0] });
    } else {
      results.push({
        action: "dry_run_create",
        note: p.note,
        payload: {
          full_name: p.full_name,
          edu_email: p.edu_email,
          area_id: AREA_FABRICA,
          school_id: schoolId,
          role_id: roleId,
          hierarchy_id: HIERARCHY_NIVEL_5,
        },
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));

  if (APPLY) {
    await client.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await client.query("ROLLBACK");
    console.log("DRY-RUN rolled back (no changes). Re-run with --apply to write.");
  }
} catch (e) {
  await client.query("ROLLBACK");
  console.error(e);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
