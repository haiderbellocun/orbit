import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

export type SmtpConfig = {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
};

export function readSmtpConfigFromEnv(): SmtpConfig | null {
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();
  if (!user || !pass) return null;

  const host = (process.env.SMTP_HOST ?? "smtp.gmail.com").trim();
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);
  const from =
    (process.env.SMTP_FROM ?? user).trim() || user;

  return { host, port, user, pass, from };
}

/** Gmail / Google Workspace: contraseña de aplicación (no la contraseña normal). */
export function createSmtpTransporter(cfg: SmtpConfig) {
  const useGmail =
    (process.env.SMTP_SERVICE ?? "").trim().toLowerCase() === "gmail" ||
    cfg.host.includes("gmail.com");

  if (useGmail) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }

  const ehloName =
    (process.env.SMTP_EHLO_NAME ?? "orbit-api").trim() || "orbit-api";

  const options: SMTPTransport.Options = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    name: ehloName,
    auth: { user: cfg.user, pass: cfg.pass },
    connectionTimeout: 30_000,
    greetingTimeout: 30_000,
    socketTimeout: 30_000,
    tls: {
      servername: cfg.host,
      minVersion: "TLSv1.2",
    },
  };

  return nodemailer.createTransport(options);
}

export function formatSmtpError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as Error & {
    code?: string;
    command?: string;
    response?: string;
    responseCode?: number;
  };
  const parts = [e.message];
  if (e.code) parts.push(`code=${e.code}`);
  if (e.command) parts.push(`command=${e.command}`);
  if (e.responseCode) parts.push(`responseCode=${e.responseCode}`);
  if (e.response) parts.push(`response=${e.response}`);
  return parts.join(" | ");
}
