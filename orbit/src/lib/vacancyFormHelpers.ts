import type { Vacancy, VacancyOperationStatus } from '@/src/types';

export const ZOHO_REQUISITION_FORM_URL =
  'https://forms.zohopublic.com/corporaciontelecampus/form/FormularioRequisicinDePersonalpruebasfabrica/formperma/-VuUg91k0dmkV0jnmTcX738gCDhJNdV9HhD7RJhSnRg';

export const STATUS_LABEL: Record<VacancyOperationStatus, string> = {
  open: 'Abierta',
  selected: 'Seleccionado',
  requisition_sent: 'Requisición Enviada',
  hired: 'Contratado',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
  cancelled_by_capital: 'Cancelada por capital',
};

export function isVacancyFullyLocked(status: VacancyOperationStatus): boolean {
  return (
    status === 'hired' ||
    status === 'closed' ||
    status === 'cancelled' ||
    status === 'cancelled_by_capital'
  );
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
