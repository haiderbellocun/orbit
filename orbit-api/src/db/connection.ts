import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const port = Number.parseInt(process.env.DB_PORT ?? "5432", 10);

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number.isNaN(port) ? 5432 : port,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
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
