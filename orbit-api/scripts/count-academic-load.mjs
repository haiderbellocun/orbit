import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

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
  const count = await pool.query(
    "SELECT COUNT(1)::int AS n FROM academic_workload.academic_load"
  );
  const sample = await pool.query(`
    SELECT al.id, al.period_code, p.document AS teacher_document
    FROM academic_workload.academic_load al
    LEFT JOIN person p ON p.id = al.person_id
    ORDER BY al.id
    LIMIT 5
  `);
  console.log(JSON.stringify({ count: count.rows[0], sample: sample.rows }, null, 2));
  await pool.end();
};

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
