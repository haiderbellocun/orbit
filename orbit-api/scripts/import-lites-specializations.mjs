/**
 * Importa/crea LITEs (role_id = 9) y acumula múltiples programas por persona
 * en person_program_assignments.programs_id.
 *
 * Este script:
 * - Detecta si las tablas viven en schema "core" (core.person) o en "public" (person)
 * - Busca school/program por nombre (NO los crea). Si faltan, falla con mensaje claro.
 * - UPSERT de person por document (actualiza full_name, edu_email, school_id, program_id, role_id)
 * - UPSERT de person_program_assignments (dedup del array + academic_line no se pisa con NULL)
 *
 * Uso:
 *   node scripts/import-lites-specializations.mjs
 */
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  options: `-c search_path=${(process.env.DB_SCHEMA ?? "public").trim()},public`,
  ssl:
    String(process.env.DB_SSL ?? "").trim().toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

async function resolveCoreSchemaMode(client) {
  const preferred = String(process.env.DB_SCHEMA ?? "").trim().toLowerCase();
  const result = await client.query(
    `SELECT
       to_regclass('public.person') AS person_public,
       to_regclass('core.person') AS person_core`
  );
  const row = result.rows[0] ?? {};
  if (preferred === "core" && row.person_core) return "core";
  if (row.person_public) return "public";
  if (row.person_core) return "core";
  return null;
}

function prefixForMode(mode) {
  return mode === "core" ? "core." : "";
}

function normalizeString(x) {
  const s = String(x ?? "").trim();
  return s.length ? s : null;
}

// Data transcrita desde la imagen proporcionada por el usuario.
// Nota: si algún nombre de programa se ve cortado en la captura, ajústalo aquí
// para que matchee exactamente con core.program.name en la BD.
const rows = [
  {
    document: "1014271861",
    full_name: "LUCAS SARMIENTO BUSTOS",
    edu_email: "lucas_sarmiento@cun.edu.co",
    program: "ESPECIALIZACION DE ANALITICA DE DATOS",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1031170727",
    full_name: "ANGIE TATIANA ROJAS VELEZ",
    edu_email: "angie_rojasv@cun.edu.co",
    program: "ESPECIALIZACION DE CONTRATACION ESTATAL",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1031170727",
    full_name: "ANGIE TATIANA ROJAS VELEZ",
    edu_email: "angie_rojasv@cun.edu.co",
    program: "ESPECIALIZACION DE PAZ Y DESARROLLO",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1023960857",
    full_name: "TANIA LIZETH ROCHA CONTRERAS",
    edu_email: "tania_rocha@cun.edu.co",
    program: "ESPECIALIZACION EN ALTA GERENCIA",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1015401108",
    full_name: "BONNIE ALEXANDRA SUAREZ SILVA",
    edu_email: "bonnie_suarez@cun.edu.co",
    program:
      "ESPECIALIZACION EN DESARROLLO ORGANIZACIONAL Y GESTION DEL TALENTO HUMANO",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1023960857",
    full_name: "TANIA LIZETH ROCHA CONTRERAS",
    edu_email: "tania_rocha@cun.edu.co",
    program: "ESPECIALIZACION EN GERENCIA DE MARCA",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1095829986",
    full_name: "ALIRIO VILLAMIZAR PARRA",
    edu_email: "alirio_villamizar@cun.edu.co",
    program: "ESPECIALIZACION EN GERENCIA DE PROYECTOS",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1023973897",
    full_name: "DIEGO RAUL GARCIA RODRIGUEZ",
    edu_email: "diego_garciar@cun.edu.co",
    program: "ESPECIALIZACION EN GERENCIA EDUCATIVA",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "80175161",
    full_name: "FREDDY YESID VELANDIA OTALORA",
    edu_email: "freddy_velandia@cun.edu.co",
    program: "ESPECIALIZACION EN GERENCIA FINANCIERA",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1023973897",
    full_name: "DIEGO RAUL GARCIA RODRIGUEZ",
    edu_email: "diego_garciar@cun.edu.co",
    program:
      "ESPECIALIZACION EN GERENCIA PARA LA TRANSICION ENERGETICA",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1095829986",
    full_name: "ALIRIO VILLAMIZAR PARRA",
    edu_email: "alirio_villamizar@cun.edu.co",
    program:
      "ESPECIALIZACION EN GESTION DE TECNOLOGIAS DE LA INFORMACION",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1014271861",
    full_name: "LUCAS SARMIENTO BUSTOS",
    edu_email: "lucas_sarmiento@cun.edu.co",
    program: "ESPECIALIZACION EN INTELIGENCIA DE NEGOCIOS",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1023960857",
    full_name: "TANIA LIZETH ROCHA CONTRERAS",
    edu_email: "tania_rocha@cun.edu.co",
    program: "ESPECIALIZACION EN MARKETING DIGITAL",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "80175161",
    full_name: "FREDDY YESID VELANDIA OTALORA",
    edu_email: "freddy_velandia@cun.edu.co",
    program: "ESPECIALIZACION EN PROSPECTIVA ESTRATEGICA",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1015401108",
    full_name: "BONNIE ALEXANDRA SUAREZ SILVA",
    edu_email: "bonnie_suarez@cun.edu.co",
    program: "ESPECIALIZACION EN SEGURIDAD Y SALUD EN EL TRABAJO",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
  {
    document: "1015595122",
    full_name: "DANIEL IVAN PARRA HERNANDEZ",
    edu_email: "daniel_parrah@cun.edu.co",
    program: "ESPECIALIZACION DE TRANSFORMACION DIGITAL",
    academic_line: "PROGRAMA ACADEMICO",
    school: "ESPECIALIZACIONES",
  },
];

const LITE_ROLE_ID = 9;

async function getSchoolId(client, prefix, schoolName) {
  const r = await client.query(
    `SELECT id FROM ${prefix}school WHERE name ILIKE $1 ORDER BY id ASC LIMIT 1`,
    [schoolName]
  );
  if (r.rows.length === 0) {
    throw new Error(
      `No existe school "${schoolName}" en ${prefix || "public"}school. Crea/importe el catálogo primero.`
    );
  }
  return Number(r.rows[0].id);
}

async function getProgramId(client, prefix, programName, schoolId) {
  const r = await client.query(
    `SELECT id FROM ${prefix}program WHERE school_id = $2 AND name ILIKE $1 ORDER BY id ASC LIMIT 1`,
    [programName, schoolId]
  );
  if (r.rows.length === 0) {
    throw new Error(
      `No existe program "${programName}" (school_id=${schoolId}) en ${prefix || "public"}program. Ajusta el nombre o crea el programa en catálogo.`
    );
  }
  return Number(r.rows[0].id);
}

async function upsertPerson(client, prefix, data) {
  const document = normalizeString(data.document);
  const fullName = normalizeString(data.full_name);
  const eduEmail = normalizeString(data.edu_email);
  if (!document || !fullName) {
    throw new Error(`Fila inválida (document/full_name requerido): ${JSON.stringify(data)}`);
  }
  const res = await client.query(
    `INSERT INTO ${prefix}person (document, full_name, edu_email, school_id, program_id, role_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (document) DO UPDATE SET
       full_name = EXCLUDED.full_name,
       edu_email = COALESCE(EXCLUDED.edu_email, ${prefix}person.edu_email),
       school_id = EXCLUDED.school_id,
       program_id = EXCLUDED.program_id,
       role_id = EXCLUDED.role_id
     RETURNING id`,
    [
      document,
      fullName,
      eduEmail,
      data.school_id,
      data.program_id,
      LITE_ROLE_ID,
    ]
  );
  return Number(res.rows[0].id);
}

async function upsertAssignment(client, prefix, personId, programId, academicLine) {
  await client.query(
    `INSERT INTO ${prefix}person_program_assignments (person_id, programs_id, academic_line)
     VALUES ($1, ARRAY[$2]::INTEGER[], $3)
     ON CONFLICT (person_id) DO UPDATE SET
       programs_id = (
         SELECT ARRAY(
           SELECT DISTINCT unnest(${prefix}person_program_assignments.programs_id || EXCLUDED.programs_id)
         )
       ),
       academic_line = COALESCE(EXCLUDED.academic_line, ${prefix}person_program_assignments.academic_line),
       updated_at = NOW()`,
    [personId, programId, academicLine]
  );
}

const main = async () => {
  const client = await pool.connect();
  try {
    const mode = await resolveCoreSchemaMode(client);
    if (!mode) throw new Error("No se encontró person ni core.person en la DB.");
    const prefix = prefixForMode(mode);

    // Preflight: asegúrate de que la tabla nueva exista.
    const ppaReg = await client.query(
      `SELECT to_regclass($1) AS reg`,
      [mode === "core" ? "core.person_program_assignments" : "person_program_assignments"]
    );
    if (!ppaReg.rows[0]?.reg) {
      throw new Error(
        `No existe ${prefix}person_program_assignments. Ejecuta primero: node scripts/migrate-create-person-program-assignments.mjs`
      );
    }

    console.log(`Schema mode: ${mode} (prefix="${prefix}")`);

    await client.query("BEGIN");

    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const schoolName = normalizeString(row.school);
      const programName = normalizeString(row.program);
      if (!schoolName || !programName) {
        throw new Error(`Fila inválida (school/program requerido): ${JSON.stringify(row)}`);
      }

      const schoolId = await getSchoolId(client, prefix, schoolName);
      const programId = await getProgramId(client, prefix, programName, schoolId);

      // Mantener person.program_id como "principal" (último visto en esta corrida).
      // El historial completo queda en programs_id (array).
      const personId = await upsertPerson(client, prefix, {
        ...row,
        school_id: schoolId,
        program_id: programId,
      });

      await upsertAssignment(
        client,
        prefix,
        personId,
        programId,
        normalizeString(row.academic_line)
      );

      // Telemetría básica: si el documento ya existía, no distinguimos insert/update
      // sin query adicional; para MVP contamos como updated.
      updated++;
      created = created; // keep
    }

    await client.query("COMMIT");
    console.log(`OK: procesadas ${rows.length} filas. persons(upsert)=${rows.length}.`);
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

main();

