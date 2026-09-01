/**
 * Excel + correo de data no congruente tras import de Carga Académica.
 * No crea docentes: solo documenta omisiones y clasificaciones fuera de carga.
 */
import fs from "fs";
import path from "path";
import ExcelJS from "exceljs";
import nodemailer from "nodemailer";

export const DEFAULT_INCONGRUENT_EMAILS = [
  "desarrollofabrica@cun.edu.co",
  "camilo_quintero@cun.edu.co",
  "johan_dazasar@cun.edu.co",
];

function parseEmails(raw) {
  return String(raw ?? "")
    .split(/[,;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.includes("@"));
}

export function incongruentRecipients() {
  const fromEnv = parseEmails(process.env.CARGA_INCONGRUENT_EMAILS);
  return fromEnv.length ? fromEnv : DEFAULT_INCONGRUENT_EMAILS;
}

function uniqueMissingPeople(skipped) {
  const byKey = new Map();
  for (const s of skipped || []) {
    const doc = String(s.document || "").trim();
    const email = String(s.email || "").trim().toLowerCase();
    const key = doc || email || `idx:${s.index}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        document: doc || "",
        email: email || "",
        name: s.name || "",
        reason: s.reason || "docente_no_existe_en_orbit",
        assignments: 0,
        periods: new Set(),
        subjects: new Set(),
      });
    }
    const row = byKey.get(key);
    row.assignments += 1;
    if (s.period) row.periods.add(s.period);
    if (s.subject) row.subjects.add(s.subject);
    if (!row.name && s.name) row.name = s.name;
    if (!row.email && email) row.email = email;
  }
  return [...byKey.values()].map((r) => ({
    ...r,
    periods: [...r.periods].sort().join(", "),
    subjects: [...r.subjects].slice(0, 12).join(", "),
  }));
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F4E79" },
  };
  row.alignment = { vertical: "middle", wrapText: true };
}

function addSheet(wb, name, headers, rows) {
  const ws = wb.addWorksheet(name.slice(0, 31));
  ws.addRow(headers);
  styleHeader(ws.getRow(1));
  for (const row of rows) ws.addRow(row);
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: headers.length },
  };
  headers.forEach((_, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(42, Math.max(14, String(headers[i]).length + 4));
  });
  return ws;
}

export async function writeIncongruentExcel({
  outputPath,
  progress,
  payload,
  skipped,
  hardErrors,
  classifiedOut,
}) {
  const people = uniqueMissingPeople(skipped);
  const excluded = Array.isArray(payload?.excluded) ? payload.excluded : [];
  const classified = classifiedOut || [];
  const allExcluded = [...excluded, ...classified];

  const wb = new ExcelJS.Workbook();
  wb.creator = "ORBIT Carga Academica";
  wb.created = new Date();

  addSheet(wb, "Resumen", ["Indicador", "Valor"], [
    ["Generado", new Date().toISOString()],
    ["Fuente JSON", progress?.source || ""],
    ["Asignaciones origen (carga)", progress?.source_meta?.total_assignments ?? ""],
    ["Cargadas OK", progress?.totals?.ok ?? 0],
    ["Docentes no encontrados (filas)", progress?.totals?.skipped_missing_person ?? people.length],
    ["Docentes no encontrados (personas)", people.length],
    ["Errores duros", (hardErrors || []).length],
    ["Excluidas practicas/diplomados/transversales", allExcluded.length],
    ["Matched por email", progress?.totals?.matched_by_email ?? 0],
    ["Validaciones (warnings)", progress?.validation?.summary?.warnings ?? 0],
    ["Regla", "NO se crean docentes. Solo se carga lo que existe en core.person."],
  ]);

  addSheet(
    wb,
    "DocentesNoEnOrbit",
    [
      "documento",
      "nombre",
      "email",
      "motivo",
      "asignaciones omitidas",
      "periodos",
      "materias (muestra)",
    ],
    people
      .sort((a, b) => String(a.name).localeCompare(String(b.name), "es"))
      .map((p) => [
        p.document,
        p.name,
        p.email,
        p.reason,
        p.assignments,
        p.periods,
        p.subjects,
      ])
  );

  addSheet(
    wb,
    "AsignacionesOmitidas",
    ["index", "documento", "nombre", "email", "periodo", "materia", "grupo", "motivo"],
    (skipped || []).map((s) => [
      s.index,
      s.document || "",
      s.name || "",
      s.email || "",
      s.period || "",
      s.subject || "",
      s.group || "",
      s.reason || "docente_no_existe_en_orbit",
    ])
  );

  addSheet(
    wb,
    "FueraDeCarga",
    [
      "tipo",
      "documento",
      "nombre",
      "email",
      "periodo",
      "materia",
      "grupo",
      "unidad",
      "programa",
      "reglas",
    ],
    allExcluded.map((a) => [
      a.classification?.activity_kind || "",
      a.person_document || a.teacher?.document || "",
      a.teacher?.name || "",
      a.teacher?.email || "",
      a.period_code || "",
      a.subject?.name || a.subject?.subject_code || "",
      a.class_group?.group_code || "",
      a.meta?.nombre_unidad || "",
      a.academic_load?.program_name || "",
      (a.classification?.classification_rules || []).join(" | "),
    ])
  );

  addSheet(
    wb,
    "Errores",
    ["index", "documento", "email", "periodo", "materia", "grupo", "error"],
    (hardErrors || []).map((e) => [
      e.index,
      e.document || "",
      e.email || "",
      e.period || "",
      e.subject || "",
      e.group || "",
      e.error || "",
    ])
  );

  const periods = progress?.source_meta?.periods || payload?.periods || [];
  addSheet(
    wb,
    "Periodos",
    ["codigo", "nombre", "estado"],
    (payload?.periods || periods).map((p) =>
      typeof p === "string"
        ? [p, "", ""]
        : [p.period_code || "", p.period_name || "", p.status || ""]
    )
  );

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  await wb.xlsx.writeFile(outputPath);
  return {
    outputPath,
    peopleCount: people.length,
    skippedCount: (skipped || []).length,
    excludedCount: allExcluded.length,
  };
}

function createTransporter() {
  const user = (process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.SMTP_PASS ?? "").trim();
  if (!user || !pass) return null;

  const host = (process.env.SMTP_HOST ?? "smtp.gmail.com").trim();
  const useGmail =
    (process.env.SMTP_SERVICE ?? "").trim().toLowerCase() === "gmail" ||
    host.includes("gmail.com");
  const port = Number.parseInt(process.env.SMTP_PORT ?? "587", 10);

  if (useGmail) {
    return {
      transporter: nodemailer.createTransport({
        service: "gmail",
        auth: { user, pass },
      }),
      from: (process.env.SMTP_FROM ?? user).trim() || user,
    };
  }
  return {
    transporter: nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      name: (process.env.SMTP_EHLO_NAME ?? "orbit-api").trim(),
      auth: { user, pass },
      tls: { servername: host, minVersion: "TLSv1.2" },
      connectionTimeout: 30_000,
    }),
    from: (process.env.SMTP_FROM ?? user).trim() || user,
  };
}

export async function sendIncongruentReportEmail({
  excelPath,
  summary,
  dryRun = false,
}) {
  const mail = createTransporter();
  if (!mail) {
    return { sent: false, reason: "smtp_not_configured" };
  }
  const to = incongruentRecipients();
  const subject = `[ORBIT] Data no congruente — Carga Académica (${summary.peopleCount} docentes sin match)`;
  const text = [
    "Reporte automático de Carga Académica (ACA → ORBIT).",
    "",
    "NO se crearon docentes. Solo se cargó lo que ya existía en core.person.",
    "",
    `Docentes no encontrados en Orbit: ${summary.peopleCount}`,
    `Asignaciones omitidas: ${summary.skippedCount}`,
    `Fuera de carga (prácticas / diplomados / transversales): ${summary.excludedCount}`,
    `Cargadas OK: ${summary.ok ?? ""}`,
    "",
    "Adjunto: Excel con el detalle.",
  ].join("\n");

  if (dryRun) {
    return { sent: false, reason: "dry_run", to, subject };
  }

  const info = await mail.transporter.sendMail({
    from: mail.from,
    to: to.join(", "),
    subject,
    text,
    attachments: excelPath
      ? [
          {
            filename: path.basename(excelPath),
            path: excelPath,
          },
        ]
      : [],
  });
  return {
    sent: true,
    to,
    messageId: info.messageId,
    response: info.response,
  };
}
