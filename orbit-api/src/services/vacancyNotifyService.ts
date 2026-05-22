import { pool } from "../db/connection";
import {
  qualifiedCoreTable,
  resolveCoreSchemaMode,
} from "../lib/coreSchema";
import {
  createSmtpTransporter,
  formatSmtpError,
  readSmtpConfigFromEnv,
} from "../lib/smtpTransport";

export type VacancyNotifyPayload = {
  vacancyId: string;
  positionName: string;
  areaName: string;
  schoolName?: string | null;
  programName?: string | null;
  quantity: number;
  createdAt: string;
};

const NOTIFY_TITLE = "nueva vacante";

function parseNotifyEmails(): string[] {
  const raw =
    process.env.VACANCY_NOTIFY_EMAILS ?? "camilo_quintero@cun.edu.co";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

async function resolvePersonIdByEmail(
  emailNorm: string
): Promise<number | null> {
  const mode = await resolveCoreSchemaMode();
  if (mode == null) return null;
  const personT = qualifiedCoreTable(mode, "person");
  const { rows } = await pool.query(
    `SELECT p.id
     FROM ${personT} p
     WHERE (
       LOWER(TRIM(p.email)) = $1
       OR LOWER(TRIM(p.edu_email)) = $1
     )
     LIMIT 1`,
    [emailNorm]
  );
  if (rows.length === 0) return null;
  const id = Number((rows[0] as { id: unknown }).id);
  return Number.isFinite(id) ? id : null;
}

function buildNotificationBody(v: VacancyNotifyPayload): string {
  const area = v.areaName?.trim() || "—";
  return `Nueva vacante en el area ${area}`;
}

function frontendVacancyUrl(vacancyId: string): string | null {
  const base = (process.env.ORBIT_FRONTEND_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/?vacancy=${encodeURIComponent(vacancyId)}`;
}

async function insertInAppNotifications(
  v: VacancyNotifyPayload,
  emails: string[]
): Promise<void> {
  const tableCheck = await pool.query(
    `SELECT to_regclass('orbit.notification') AS t`
  );
  if (tableCheck.rows[0]?.t == null) return;

  const title = NOTIFY_TITLE;
  const body = buildNotificationBody(v);
  const payload = {
    vacancyId: v.vacancyId,
    positionName: v.positionName,
    areaName: v.areaName,
    schoolName: v.schoolName ?? null,
    programName: v.programName ?? null,
  };

  for (const email of emails) {
    const personId = await resolvePersonIdByEmail(email);
    if (personId == null) continue;
    await pool.query(
      `INSERT INTO orbit.notification (
         recipient_person_id, type, title, body, payload
       ) VALUES ($1, 'vacancy_created', $2, $3, $4::jsonb)`,
      [personId, title, body, JSON.stringify(payload)]
    );
  }
}

async function sendVacancyEmails(
  v: VacancyNotifyPayload,
  emails: string[]
): Promise<void> {
  const smtpUser = (process.env.SMTP_USER ?? "").trim();
  const smtpPass = (process.env.SMTP_PASS ?? "").trim();
  const cfg = readSmtpConfigFromEnv();
  if (cfg == null) {
    if (smtpUser && !smtpPass) {
      console.warn(
        "vacancyNotify: SMTP_PASS vacío en .env. Gmail requiere contraseña de aplicación: https://myaccount.google.com/apppasswords"
      );
    } else {
      console.warn(
        "vacancyNotify: SMTP_USER/SMTP_PASS no configurados; correo omitido."
      );
    }
    return;
  }

  const transporter = createSmtpTransporter(cfg);

  const url = frontendVacancyUrl(v.vacancyId);
  const textBody = buildNotificationBody(v);
  const htmlBody = `<p>${textBody}</p>${url ? `<p><a href="${url}">Ver en Orbit</a></p>` : ""}`;

  const info = await transporter.sendMail({
    from: cfg.from,
    to: emails.join(", "),
    subject: NOTIFY_TITLE,
    text: textBody + (url ? `\n\nVer en Orbit: ${url}` : ""),
    html: htmlBody,
  });

  console.info(
    "vacancyNotify: correo enviado",
    { to: emails, messageId: info.messageId, response: info.response }
  );
}

/** Best-effort: no lanza si falla SMTP o notificaciones in-app. */
export async function notifyVacancyCreated(
  v: VacancyNotifyPayload
): Promise<void> {
  const emails = parseNotifyEmails();
  if (emails.length === 0) return;

  try {
    await insertInAppNotifications(v, emails);
  } catch (e) {
    console.error("vacancyNotify: in-app insert failed:", e);
  }

  try {
    await sendVacancyEmails(v, emails);
  } catch (e) {
    console.error("vacancyNotify: SMTP send failed:", formatSmtpError(e));
  }
}
