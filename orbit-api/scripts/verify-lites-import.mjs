import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const schema = (process.env.DB_SCHEMA ?? "public").trim();
const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  options: `-c search_path=${schema},public`,
});

const docs = [
  "1014271861",
  "1031170727",
  "1023960857",
  "1015401108",
  "1095829986",
  "1023973897",
  "80175161",
  "1015595122",
];

const main = async () => {
  const client = await pool.connect();
  try {
    const res = await client.query(
      `SELECT
         p.document,
         p.full_name,
         p.edu_email,
         p.program_id AS person_program_id,
         ppa.programs_id,
         ppa.academic_line
       FROM core.person p
       LEFT JOIN core.person_program_assignments ppa ON ppa.person_id = p.id
       WHERE p.role_id = 9 AND p.document = ANY($1::text[])
       ORDER BY p.document`,
      [docs]
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

