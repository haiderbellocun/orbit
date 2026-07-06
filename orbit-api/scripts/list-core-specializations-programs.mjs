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

const main = async () => {
  const client = await pool.connect();
  try {
    const schools = await client.query(
      `SELECT id, name FROM core.school WHERE name ILIKE '%ESPECIALIZACIONES%' ORDER BY id ASC`
    );
    console.log("Schools:", schools.rows);

    const schoolIds = schools.rows.map((r) => Number(r.id)).filter((x) => !Number.isNaN(x));
    if (schoolIds.length === 0) return;

    const programs = await client.query(
      `SELECT id, school_id, name
       FROM core.program
       WHERE school_id = ANY($1::bigint[])
       ORDER BY name ASC NULLS LAST`,
      [schoolIds]
    );
    console.log("Programs:", programs.rows);
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

