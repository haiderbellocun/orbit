import type { Vacancy, VacancyOperationStatus } from '@/src/types';

const BOGOTA_TZ = 'America/Bogota';

const TERMINAL_STATUSES = new Set<VacancyOperationStatus>([
  'hired',
  'closed',
  'cancelled',
  'cancelled_by_capital',
]);

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

function endIsoForVacancy(v: Vacancy): string {
  if (v.closedAt) return v.closedAt;
  if (TERMINAL_STATUSES.has(v.operationStatus) && v.updatedAt) {
    return v.updatedAt;
  }
  return new Date().toISOString();
}

export function computeVacancyActiveDays(v: Vacancy): number {
  const startKey = calendarDayKey(v.createdAt);
  const endKey = calendarDayKey(endIsoForVacancy(v));
  if (TERMINAL_STATUSES.has(v.operationStatus) || v.closedAt) {
    return dayDiffInclusive(startKey, endKey);
  }
  return dayDiffInclusive(startKey, todayKeyBogota());
}

export function formatVacancyActiveDaysLabel(days: number): string {
  return days === 1 ? '1 día' : `${days} días`;
}

export function vacancyActiveDaysTooltip(v: Vacancy): string {
  const start = new Date(v.createdAt).toLocaleDateString('es-CO', {
    timeZone: BOGOTA_TZ,
    dateStyle: 'medium',
  });
  const endIso = endIsoForVacancy(v);
  const endLabel =
    TERMINAL_STATUSES.has(v.operationStatus) || v.closedAt
      ? new Date(endIso).toLocaleDateString('es-CO', {
          timeZone: BOGOTA_TZ,
          dateStyle: 'medium',
        })
      : 'Hoy';
  return `Creada: ${start} · Hasta: ${endLabel}`;
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
