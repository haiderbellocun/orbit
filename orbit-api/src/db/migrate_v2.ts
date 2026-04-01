import fs from "fs";
import path from "path";
import { pool } from "./connection";

async function migrateV2(): Promise<void> {
  const schemaPath = path.join(__dirname, "schema_v2.sql");
  const sql = fs.readFileSync(schemaPath, "utf-8");
  await pool.query(sql);
  console.log("Migración v2 completada");
  await pool.end();
}

migrateV2().catch((err) => {
  console.error(err);
  void pool.end();
  process.exit(1);
});
