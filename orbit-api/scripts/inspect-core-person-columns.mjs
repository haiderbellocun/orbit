import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ override: true });

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
});

const main = async () => {
  const r = await pool.query(
    `SELECT column_name, data_type, is_nullable, column_default
     FROM information_schema.columns
     WHERE table_schema = 'core' AND table_name = 'person'
     ORDER BY ordinal_position`
  );
  console.log(JSON.stringify(r.rows, null, 2));
  await pool.end();
};

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
