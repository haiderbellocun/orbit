import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const port = Number.parseInt(process.env.DB_PORT ?? "5432", 10);
const schema = (process.env.DB_SCHEMA ?? "public").trim();

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number.isNaN(port) ? 5432 : port,
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  options: `-c search_path=${schema},public`,
});

export async function verifyConnection(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}
