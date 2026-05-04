import dotenv from "dotenv";
import { Pool, type PoolConfig } from "pg";

dotenv.config();

function parseBool(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined || value.trim() === "") return defaultValue;
  const v = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(v)) return true;
  if (["0", "false", "no", "off"].includes(v)) return false;
  return defaultValue;
}

const dbPortRaw = Number.parseInt(process.env.DB_PORT ?? "5432", 10);
const dbPort = Number.isNaN(dbPortRaw) ? 5432 : dbPortRaw;

const dbHost = (process.env.DB_HOST ?? "localhost").trim();
const dbUser = (
  process.env.DB_USER ??
  process.env.DB_USERNAME ??
  "postgres"
).trim();
const dbName = (process.env.DB_NAME ?? "orbit").trim();
const schema = (process.env.DB_SCHEMA ?? "public").trim();
const dbSsl = parseBool(process.env.DB_SSL, false);

const poolConfig: PoolConfig = {
  host: dbHost,
  port: dbPort,
  user: dbUser,
  password: process.env.DB_PASSWORD ?? "",
  database: dbName,
  options: `-c search_path=${schema},public`,
};

if (dbSsl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

export const pool = new Pool(poolConfig);

/** Safe for logs: never includes DB_PASSWORD. */
export function getDatabaseConfigSummary(): {
  host: string;
  port: number;
  user: string;
  database: string;
  schema: string;
  ssl: boolean;
} {
  return {
    host: dbHost,
    port: dbPort,
    user: dbUser,
    database: dbName,
    schema,
    ssl: dbSsl,
  };
}

export async function verifyConnection(): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    return true;
  } finally {
    client.release();
  }
}
