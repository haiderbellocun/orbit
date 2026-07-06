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
    const queries = [
      `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema='core' AND table_name='program'
         AND column_name IN ('id','school_id','name')
       ORDER BY column_name`,
      `SELECT column_name, data_type, column_default, is_nullable
       FROM information_schema.columns
       WHERE table_schema='core' AND table_name='school'
         AND column_name IN ('id','name')
       ORDER BY column_name`,
    ];
    for (const q of queries) {
      const res = await client.query(q);
      console.log("\n" + q + "\n" + JSON.stringify(res.rows, null, 2));
    }
  } finally {
    client.release();
    await pool.end();
  }
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

