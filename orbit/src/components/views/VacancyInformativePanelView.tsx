import React, { useCallback, useEffect, useState } from 'react';
import { Header } from '@/src/components/layout/Header';
import { getVacancyAuditLog, type VacancyAuditLogEntry } from '@/src/lib/api';
import { STATUS_LABEL, formatVacancyDt } from '@/src/lib/vacancyFormHelpers';
import type { VacancyOperationStatus } from '@/src/types';

function statusLabelEs(code: unknown): string {
  if (code == null || code === '') return 'Sin estado';
  const key = String(code).trim() as VacancyOperationStatus;
  return STATUS_LABEL[key] ?? String(code);
}

const DETAIL_FIELD_LABELS: Record<string, string> = {
  operationStatus: 'estado de la vacante',
  reqNumber: 'número de requisición',
  sentToCapitalAt: 'fecha de envío a capital',
  capitalNotes: 'notas de capital humano',
  shortlistComplied: 'cumplimiento de terna',
  pdaComplied: 'cumplimiento PDA',
  contractConditionsComplied: 'condiciones contractuales',
  preInterviewCvComplied: 'hojas de vida pre-entrevista',
  positionName: 'cargo',
  areaId: 'área',
  schoolId: 'escuela',
  programId: 'programa',
  quantity: 'cantidad',
  hiredQuantity: 'cantidad contratada',
  curricularLine: 'línea curricular',
  directManagerIdentification: 'jefe inmediato',
};

function describeChangedFields(payload: Record<string, unknown>): string | null {
  const skip = new Set([
    'vacancyId',
    'vacancyPublicId',
    'positionName',
    'areaName',
    'schoolName',
    'operationStatus',
    'actionType',
    'previousOperationStatus',
    'requisition',
    'requisitionPatch',
  ]);
  const labels: string[] = [];
  for (const key of Object.keys(payload)) {
    if (skip.has(key)) continue;
    if (payload[key] === undefined) continue;
    labels.push(DETAIL_FIELD_LABELS[key] ?? key);
  }
  if (labels.length === 0) return null;
  if (labels.length === 1) return `Se modificó: ${labels[0]}.`;
  const last = labels.pop();
  return `Se modificaron: ${labels.join(', ')} y ${last}.`;
}

function formatAuditDetail(entry: VacancyAuditLogEntry): string {
  const d = entry.details;

  if (entry.action === 'DELETE' || d.actionType === 'total_delete') {
    const req =
      d.requisition != null && typeof d.requisition === 'object'
        ? (d.requisition as { reqNumber?: unknown }).reqNumber
        : entry.reqNumber;
    if (req != null && String(req).trim() !== '') {
      return `Se eliminó la vacante y su requisición (REQ ${String(req)}).`;
    }
    return 'Se eliminó por completo la vacante y los datos asociados.';
  }

  if (d.actionType === 'create' || entry.action === 'INSERT') {
    return 'Se creó una nueva vacante en el sistema.';
  }

  if (d.actionType === 'admin_status_change') {
    const prev = statusLabelEs(d.previousOperationStatus);
    const next = statusLabelEs(d.operationStatus);
    return `Cambio de estado (administrador): de «${prev}» a «${next}».`;
  }

  if (d.actionType === 'requisition_created') {
    const parts: string[] = ['Se registró la requisición'];
    if (d.reqNumber != null && String(d.reqNumber).trim() !== '') {
      parts.push(`número ${String(d.reqNumber)}`);
    }
    if (d.sentToCapitalAt != null) {
      parts.push('con fecha de envío a capital');
    }
    return `${parts.join(', ')}.`;
  }

  if (d.actionType === 'requisition_patch' || d.requisitionPatch != null) {
    const patch =
      d.requisitionPatch != null && typeof d.requisitionPatch === 'object'
        ? (d.requisitionPatch as Record<string, unknown>)
        : d;
    const described = describeChangedFields(patch);
    return described ?? 'Se actualizaron datos de la requisición (capital, REQ o cumplimientos).';
  }

  if (d.operationNoteAppended === true || d.actionType === 'operation_note') {
    return 'Se añadió un comentario en observaciones de operación.';
  }

  if (d.actionType === 'close' || d.operationStatus != null) {
    const next = statusLabelEs(d.operationStatus);
    return `Se cambió el estado de la vacante a «${next}».`;
  }

  if (d.actionType === 'vacancy_patch') {
    const described = describeChangedFields(d);
    if (described) return described;
    if (d.operationStatus != null) {
      return `Se cambió el estado a «${statusLabelEs(d.operationStatus)}».`;
    }
    return 'Se actualizaron datos generales de la vacante.';
  }

  const fallback = describeChangedFields(d);
  if (fallback) return fallback;

  return entry.actionLabel || 'Registro de actividad en la vacante.';
}

export const VacancyInformativePanelView: React.FC = () => {
  const [rows, setRows] = useState<VacancyAuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getVacancyAuditLog({
        q: q.trim() || undefined,
        from: from || undefined,
        to: to || undefined,
        limit: 300,
      });
      setRows(res.data ?? []);
    } catch (e) {
      setRows([]);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el historial');
    } finally {
      setLoading(false);
    }
  }, [q, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <Header
        title="Panel informativo"
        subtitle="Historial de acciones sobre vacantes y requisiciones (auditoría)"
      />

      <div
        data-tutorial="informative-actions"
        className="glass-panel p-4 flex flex-col sm:flex-row flex-wrap gap-3 items-end"
      >
        <label className="flex flex-col gap-1 text-xs font-bold uppercase text-orbit-muted tracking-widest min-w-[140px] flex-1">
          Buscar
          <input
            type="search"
            className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
            placeholder="Cargo, área, REQ…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase text-orbit-muted tracking-widest">
          Desde
          <input
            type="date"
            className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase text-orbit-muted tracking-widest">
          Hasta
          <input
            type="date"
            className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={() => {
            setQ('');
            setFrom('');
            setTo('');
          }}
          disabled={loading || (q === '' && from === '' && to === '')}
          className="glass-button-primary py-2.5 px-5 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reiniciar filtros
        </button>
      </div>

      {error && (
        <div className="glass-panel p-4 text-sm text-orbit-danger">{error}</div>
      )}

      <div className="glass-panel p-0 overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead>
            <tr className="border-b border-orbit-border/80 bg-orbit-bg-secondary/80 dark:bg-orbit-elevated/80 text-xs uppercase tracking-widest text-orbit-muted">
              <th className="py-3 px-4 font-bold">Fecha</th>
              <th className="py-3 px-4 font-bold">Vacante</th>
              <th className="py-3 px-4 font-bold">Acción</th>
              <th className="py-3 px-4 font-bold">Usuario</th>
              <th className="py-3 px-4 font-bold">Qué se hizo</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-orbit-muted">
                  Cargando…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-12 text-center text-orbit-muted">
                  Sin registros para los filtros seleccionados.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-orbit-border/80 hover:bg-orbit-interactive/20"
                >
                  <td className="py-3 px-4 text-orbit-text-secondary whitespace-nowrap text-xs">
                    {formatVacancyDt(row.createdAt)}
                  </td>
                  <td className="py-3 px-4">
                    <p className="font-medium text-orbit-text">
                      {row.positionName || '—'}
                      {row.vacancyDeleted && (
                        <span className="ml-1 text-[10px] uppercase text-red-600 dark:text-red-300 font-bold">
                          (eliminada)
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-orbit-muted">
                      {row.areaName || '—'}
                      {row.vacancyPublicId != null
                        ? ` · #${row.vacancyPublicId}`
                        : ''}
                      {row.reqNumber ? ` · ${row.reqNumber}` : ''}
                    </p>
                  </td>
                  <td className="py-3 px-4 text-orbit-text text-xs font-semibold">
                    {row.actionLabel}
                  </td>
                  <td className="py-3 px-4 text-orbit-text-secondary">
                    {row.actorName ?? '—'}
                  </td>
                  <td className="py-3 px-4 text-orbit-text-secondary text-xs max-w-xs">
                    {formatAuditDetail(row)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
