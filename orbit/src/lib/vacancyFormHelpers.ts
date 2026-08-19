import type { Vacancy, VacancyOperationStatus } from '@/src/types';

export const ZOHO_REQUISITION_FORM_URL =
  'https://forms.zohopublic.com/corporaciontelecampus/form/FormularioRequisicinDePersonalpruebasfabrica/formperma/-VuUg91k0dmkV0jnmTcX738gCDhJNdV9HhD7RJhSnRg';

export const STATUS_LABEL: Record<VacancyOperationStatus, string> = {
  open: 'Abierta',
  selected: 'Seleccionado',
  requisition_sent: 'Requisición Enviada',
  internal_movement: 'Movimiento interno',
  hired: 'Contratado',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
  cancelled_by_capital: 'Cancelada por capital',
};

const TERMINAL_STATUSES = new Set<VacancyOperationStatus>([
  'hired',
  'closed',
  'cancelled',
  'cancelled_by_capital',
]);

/** Estado terminal (contratado, cerrado o cancelado). */
export function isVacancyTerminalStatus(
  status: VacancyOperationStatus
): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** @deprecated Use isVacancyTerminalStatus or canOpenVacancyManage */
export function isVacancyFullyLocked(status: VacancyOperationStatus): boolean {
  return isVacancyTerminalStatus(status);
}

/** Puede abrir el modal de gestión (al menos pestaña requisición). */
export function canOpenVacancyManage(
  status: VacancyOperationStatus,
  isVacancyAdmin = false
): boolean {
  if (isVacancyAdmin) return true;
  if (!TERMINAL_STATUSES.has(status)) return true;
  return status === 'hired';
}

/** Solo edición de requisición (p. ej. contratado). */
export function isVacancyHiredRequisitionOnly(
  status: VacancyOperationStatus
): boolean {
  return status === 'hired';
}

/** Campos base de vacante y estado estándar bloqueados. */
export function isVacancyCoreEditBlocked(
  status: VacancyOperationStatus
): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isVacancyCoreFieldsLocked(v: Vacancy): boolean {
  return Boolean(v.reqAssignedAt);
}

export type TriSelectValue = '' | 'true' | 'false';

export function triToBool(s: TriSelectValue): boolean | null {
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

export function boolToTri(v: boolean | null | undefined): TriSelectValue {
  if (v === true) return 'true';
  if (v === false) return 'false';
  return '';
}

export function triLabel(v: TriSelectValue): string {
  if (v === 'true') return 'Sí cumplió';
  if (v === 'false') return 'No cumplió';
  return 'Pendiente';
}

export function hasRequisitionDraft(
  reqNumber: string,
  reqSentAt: string,
  reqCapNotes: string,
  terna: TriSelectValue,
  pda: TriSelectValue,
  contract: TriSelectValue,
  cv: TriSelectValue
): boolean {
  return (
    reqNumber.trim() !== '' ||
    reqSentAt.trim() !== '' ||
    reqCapNotes.trim() !== '' ||
    terna !== '' ||
    pda !== '' ||
    contract !== '' ||
    cv !== ''
  );
}

export function formatVacancyDt(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

/** Texto de confirmación destructiva (case-insensitive). */
export function isConfirmTextValid(text: string): boolean {
  return text.trim().toLowerCase() === 'confirmar';
}
