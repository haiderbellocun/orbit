import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config({ override: true });

const port = Number.parseInt(process.env.DB_PORT ?? "5432", 10);
const schema = (process.env.DB_SCHEMA ?? "public").trim();

function isLocalHost(host: string | undefined): boolean {
  const h = String(host ?? "")
    .trim()
    .toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1";
}

function resolveSsl():
  | boolean
  | { rejectUnauthorized: boolean }
  | undefined {
  const explicit = (process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return undefined;
  if (explicit === "true" || explicit === "1") {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    return { rejectUnauthorized };
  }

  const sslMode = (process.env.PGSSLMODE ?? "").trim().toLowerCase();
  if (
    sslMode === "require" ||
    sslMode === "verify-ca" ||
    sslMode === "verify-full"
  ) {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    return { rejectUnauthorized };
  }

  // Cloud SQL / hosts remotos suelen exigir TLS aunque PGSSLMODE no venga seteado.
  if (!isLocalHost(process.env.DB_HOST)) {
    const rejectUnauthorized =
      (process.env.DB_SSL_REJECT_UNAUTHORIZED ?? "false").trim().toLowerCase() ===
      "true";
    return { rejectUnauthorized };
  }

  return undefined;
}

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number.isNaN(port) ? 5432 : port,
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.DB_NAME,
  ssl: resolveSsl(),
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
