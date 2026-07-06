/**
 * Prueba conexión SMTP: node scripts/test-smtp.mjs
 * Requiere orbit-api/.env con SMTP_USER, SMTP_PASS, etc.
 */
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env"), override: true });

const host = (process.env.SMTP_HOST ?? "smtp.gmail.com").trim();
const useGmail =
  (process.env.SMTP_SERVICE ?? "").trim().toLowerCase() === "gmail" ||
  host.includes("gmail.com");
const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
const user = (process.env.SMTP_USER ?? "").trim();
const pass = (process.env.SMTP_PASS ?? "").trim();
const to =
  (process.env.VACANCY_NOTIFY_EMAILS ?? "camilo_quintero@cun.edu.co")
    .split(",")[0]
    ?.trim() ?? "";

if (!user || !pass) {
  console.error("Faltan SMTP_USER o SMTP_PASS en .env");
  process.exit(1);
}

const transporter = useGmail
  ? nodemailer.createTransport({ service: "gmail", auth: { user, pass } })
  : nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      name: (process.env.SMTP_EHLO_NAME ?? "orbit-api").trim(),
      auth: { user, pass },
      tls: { servername: host, minVersion: "TLSv1.2" },
      connectionTimeout: 30_000,
    });

console.log("Probando SMTP:", { host, port, user, to });

try {
  await transporter.verify();
  console.log("OK: verify() — conexión y autenticación SMTP");
} catch (e) {
  console.error("FAIL verify():", e);
  process.exit(1);
}

try {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM?.trim() || user,
    to,
    subject: "nueva vacante",
    text: "Nueva vacante en el area FABRICA Y DESARROLLO (prueba Orbit)",
  });
  console.log("OK: sendMail", info.messageId, info.response);
} catch (e) {
  console.error("FAIL sendMail():", e);
  process.exit(1);
}
