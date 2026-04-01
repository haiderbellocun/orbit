import fs from "fs";
import path from "path";
import { pool } from "./connection";

async function migrate(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  await pool.query(sql);
  console.log("Migración completada");
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
