export type VacancyNotifyPayload = {
  vacancyId: string;
  positionName: string;
  areaName: string;
  schoolName?: string | null;
  programName?: string | null;
  quantity: number;
  createdAt: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatCreatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleString("es-CO", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function row(label: string, value: string): string {
  const v = value.trim() || "—";
  return `
    <tr>
      <td style="padding:10px 0;color:#64748b;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;width:140px;vertical-align:top;">
        ${escapeHtml(label)}
      </td>
      <td style="padding:10px 0;color:#0f172a;font-size:15px;font-weight:500;vertical-align:top;">
        ${escapeHtml(v)}
      </td>
    </tr>`;
}

export function buildVacancyEmailSubject(v: VacancyNotifyPayload): string {
  const cargo = v.positionName?.trim() || "Nueva vacante";
  return `Nueva vacante — ${cargo}`;
}

export function buildVacancyEmailText(
  v: VacancyNotifyPayload,
  orbitUrl: string | null
): string {
  const area = v.areaName?.trim() || "—";
  const lines = [
    "Hola,",
    "",
    `Se registró una nueva vacante en el área ${area}.`,
    "",
    `Cargo: ${v.positionName}`,
    `Área: ${area}`,
    `Escuela: ${v.schoolName?.trim() || "—"}`,
    `Programa: ${v.programName?.trim() || "—"}`,
    `Cantidad de plazas: ${v.quantity}`,
    `Fecha de registro: ${formatCreatedAt(v.createdAt)}`,
  ];
  if (orbitUrl) lines.push("", `Ver en Orbit: ${orbitUrl}`);
  lines.push("", "—", "Orbit · Capital humano");
  return lines.join("\n");
}

export function buildVacancyEmailHtml(
  v: VacancyNotifyPayload,
  orbitUrl: string | null
): string {
  const cargo = escapeHtml(v.positionName?.trim() || "Vacante");
  const area = v.areaName?.trim() || "—";
  const cta = orbitUrl
    ? `<a href="${escapeHtml(orbitUrl)}" style="display:inline-block;margin-top:28px;padding:14px 28px;background:linear-gradient(135deg,#7c3aed 0%,#d946ef 100%);color:#ffffff;text-decoration:none;font-size:13px;font-weight:700;border-radius:12px;letter-spacing:0.04em;text-transform:uppercase;box-shadow:0 4px 14px rgba(124,58,237,0.35);">
        Ver vacante en Orbit
      </a>`
    : "";

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Nueva vacante</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',system-ui,-apple-system,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,0.08);">
          <tr>
            <td style="padding:32px 36px 24px;background:linear-gradient(135deg,#6d28d9 0%,#a855f7 50%,#d946ef 100%);">
              <p style="margin:0 0 8px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.85);letter-spacing:0.12em;text-transform:uppercase;">
                Orbit · Capital humano
              </p>
              <h1 style="margin:0;font-size:26px;font-weight:700;color:#ffffff;line-height:1.25;">
                Nueva vacante registrada
              </h1>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 36px 8px;">
              <p style="margin:0 0 20px;font-size:15px;color:#475569;line-height:1.6;">
                Hola, les informamos que se abrió una nueva vacante en
                <strong style="color:#6d28d9;">${escapeHtml(area)}</strong>.
                A continuación el detalle:
              </p>
              <div style="background:linear-gradient(135deg,#f5f3ff 0%,#fdf4ff 100%);border:1px solid #e9d5ff;border-radius:16px;padding:22px 24px;margin-bottom:8px;">
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;color:#7c3aed;letter-spacing:0.1em;text-transform:uppercase;">
                  Cargo
                </p>
                <p style="margin:0;font-size:22px;font-weight:700;color:#1e1b4b;line-height:1.3;">
                  ${cargo}
                </p>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 36px 28px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-top:1px solid #e2e8f0;">
                ${row("Área", area)}
                ${row("Escuela", v.schoolName ?? "—")}
                ${row("Programa", v.programName ?? "—")}
                ${row("Plazas", String(v.quantity))}
                ${row("Registrada", formatCreatedAt(v.createdAt))}
              </table>
              ${cta}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
              <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;text-align:center;">
                Este mensaje fue enviado automáticamente por Orbit.<br />
                Por favor no respondan a este correo.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
