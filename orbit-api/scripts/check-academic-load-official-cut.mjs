/**
 * Alerta si no existe corte oficial OK del día (America/Bogota).
 * Pensado para cron 17:30.
 *
 * Exit codes:
 *   0 = OK (existe corte o --notify-only sin fallo de envío)
 *   2 = falta corte oficial
 *
 * Uso:
 *   node scripts/check-academic-load-official-cut.mjs
 *   node scripts/check-academic-load-official-cut.mjs --notify
 */
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import pg from "pg";
import nodemailer from "nodemailer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env"), override: true });

const args = process.argv.slice(2);
const NOTIFY = args.includes("--notify");

function resolveSsl() {
  const explicit = String(process.env.DB_SSL ?? "").trim().toLowerCase();
  if (explicit === "false" || explicit === "0") return undefined;
  if (explicit === "true" || explicit === "1") {
    return { rejectUnauthorized: false };
  }
  const host = String(process.env.DB_HOST ?? "").trim().toLowerCase();
  if (host && host !== "localhost" && host !== "127.0.0.1") {
    return { rejectUnauthorized: false };
  }
  return undefined;
}

const pool = new pg.Pool({
  host: process.env.DB_HOST,
  port: Number.parseInt(process.env.DB_PORT ?? "5432", 10),
  user: process.env.DB_USERNAME ?? process.env.DB_USER,
  password: String(process.env.DB_PASSWORD ?? "").replace(/^['"]|['"]$/g, ""),
  database: process.env.DB_NAME,
  ssl: resolveSsl(),
});

async function sendAlert(subject, body) {
  const host = process.env.SMTP_HOST;
  const to =
    process.env.ACADEMIC_LOAD_ALERT_EMAILS ||
    process.env.VACANCY_NOTIFY_EMAILS ||
    "";
  if (!host || !to) {
    console.warn("SMTP/destinatarios no configurados; no se envía correo");
    return { sent: false, reason: "missing_smtp_or_to" };
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || "").toLowerCase() === "true",
    auth:
      process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: to.split(",").map((s) => s.trim()).filter(Boolean),
    subject,
    text: body,
  });
  return { sent: true };
}

async function main() {
  const client = await pool.connect();
  try {
    const r = await client.query(`
      SELECT id, imported_at, fecha_carga, row_count, status
      FROM academic_workload.import_run
      WHERE is_official
        AND status = 'ok'
        AND fecha_carga = ((now() AT TIME ZONE 'America/Bogota')::date)
      ORDER BY imported_at DESC
      LIMIT 1
    `);

    if (r.rows.length) {
      console.log(
        JSON.stringify({ ok: true, run: r.rows[0] }, null, 2)
      );
      return;
    }

    const msg = `Falta corte oficial de carga académica para hoy (America/Bogota). Hora check: ${new Date().toISOString()}`;
    console.error(msg);
    if (NOTIFY) {
      const mail = await sendAlert(
        "[Orbit] Falta corte oficial carga académica 17:00",
        msg
      );
      console.error("notify:", mail);
    }
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(async (err) => {
  console.error(err);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
