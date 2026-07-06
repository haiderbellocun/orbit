const BOGOTA_TZ = 'America/Bogota';

function calendarDayKey(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ });
}

function todayKeyBogota(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ });
}

function dayDiffInclusive(startKey: string, endKey: string): number {
  const [sy, sm, sd] = startKey.split('-').map(Number);
  const [ey, em, ed] = endKey.split('-').map(Number);
  const start = Date.UTC(sy, sm - 1, sd);
  const end = Date.UTC(ey, em - 1, ed);
  const diff = Math.floor((end - start) / 86_400_000);
  return Math.max(1, diff + 1);
}

/** Días desde envío a capital hasta hoy (inclusive). Requiere `sentToCapitalAt`. */
export function computeVacancyActiveDaysFromSent(sentToCapitalAt: string): number {
  const startKey = calendarDayKey(sentToCapitalAt);
  const endKey = todayKeyBogota();
  return dayDiffInclusive(startKey, endKey);
}

export function formatVacancyActiveDaysLabel(days: number): string {
  return days === 1 ? '1 día' : `${days} días`;
}

export function vacancyActiveDaysTooltip(sentToCapitalAt: string): string {
  const start = new Date(sentToCapitalAt).toLocaleDateString('es-CO', {
    timeZone: BOGOTA_TZ,
    dateStyle: 'medium',
  });
  return `Enviado a capital: ${start} · Hasta: Hoy`;
}

export function formatVacancyDateOnly(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return d.toLocaleDateString('es-CO', {
    timeZone: BOGOTA_TZ,
    dateStyle: 'short',
  });
}

/** YYYY-MM-DD local (Bogotá) for date inputs. */
export function isoToDateInputValue(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-CA', { timeZone: BOGOTA_TZ });
}

/** Date-only string from date input → ISO at noon UTC (stable). */
export function dateInputToIso(dateStr: string): string | null {
  const t = dateStr.trim();
  if (t === '') return null;
  const d = new Date(`${t}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
