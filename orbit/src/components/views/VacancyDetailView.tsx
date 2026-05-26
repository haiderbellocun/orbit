import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  ChevronLeftIcon,
  BriefcaseIcon,
  RectangleGroupIcon,
  ClockIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/solid';
import type { Vacancy, VacancyDetail, View } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { getVacancy } from '@/src/lib/api';
import {
  computeVacancyActiveDays,
  formatVacancyActiveDaysLabel,
  formatVacancyDateOnly,
  vacancyActiveDaysTooltip,
} from '@/src/lib/vacancyActiveDays';

const STATUS_LABEL: Record<Vacancy['operationStatus'], string> = {
  open: 'Abierta',
  selected: 'Seleccionado',
  requisition_sent: 'Requisición Enviada',
  hired: 'Contratado',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
  cancelled_by_capital: 'Cancelada por capital',
};

function formatTs(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
  return d.toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

function tri(v: boolean | null | undefined): string {
  if (v === true) return 'Sí cumplió';
  if (v === false) return 'No cumplió';
  return 'Pendiente';
}

interface VacancyDetailViewProps {
  summary: Vacancy;
  setView: (v: View) => void;
}

export const VacancyDetailView: React.FC<VacancyDetailViewProps> = ({
  summary,
  setView,
}) => {
  const [detail, setDetail] = useState<VacancyDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await getVacancy(summary.id);
        if (!cancelled) setDetail(d);
      } catch (e) {
        if (!cancelled) {
          setDetail(null);
          setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [summary.id, summary.updatedAt]);

  const v = detail ?? {
    ...summary,
    requisition: summary.reqAssignedAt
      ? {
          id: '',
          reqNumber: summary.reqNumber ?? null,
          assignedAt: summary.reqAssignedAt ?? '',
          sentToCapitalAt: summary.sentToCapitalAt ?? null,
          capitalNotes: summary.capitalNotes ?? null,
          shortlistComplied: summary.shortlistComplied,
          pdaComplied: summary.pdaComplied,
          contractConditionsComplied: summary.contractConditionsComplied,
          preInterviewCvComplied: summary.preInterviewCvComplied,
        }
      : null,
    statusHistory: [] as VacancyDetail['statusHistory'],
  };

  return (
    <div className="space-y-8">
      <button
        type="button"
        onClick={() => setView('vacancies')}
        className="flex items-center gap-2 text-slate-500 hover:text-violet-600 transition-colors font-bold text-xs uppercase tracking-widest group"
      >
        <ChevronLeftIcon className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
        <span>Volver a Vacantes</span>
      </button>

      {error && (
        <div className="glass-panel p-4 text-sm text-rose-700 bg-rose-50/90 border border-rose-100">
          {error}
          <span className="block text-xs text-slate-600 mt-1">
            Mostrando datos resumidos desde la tabla.
          </span>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-xl shadow-violet-500/20 shrink-0">
            <BriefcaseIcon className="h-6 w-6 sm:h-8 sm:w-8" />
          </div>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
              <h1 className="text-xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight">
                {v.positionName}
              </h1>
              <span
                className={cn(
                  'w-fit px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm',
                  v.operationStatus === 'open' && 'bg-blue-50 text-blue-600 border-blue-100',
                  v.operationStatus === 'selected' && 'bg-amber-50 text-amber-600 border-amber-100',
                  v.operationStatus === 'requisition_sent' &&
                    'bg-violet-50 text-violet-700 border-violet-100',
                  v.operationStatus === 'hired' && 'bg-emerald-50 text-emerald-700 border-emerald-100',
                  (v.operationStatus === 'closed' ||
                    v.operationStatus === 'cancelled' ||
                    v.operationStatus === 'cancelled_by_capital') &&
                    'bg-slate-100 text-slate-600 border-slate-200'
                )}
              >
                {STATUS_LABEL[v.operationStatus]}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <RectangleGroupIcon className="h-3.5 w-3.5 text-violet-500" />
                <span>
                  {v.schoolName ?? 'Escuela'} — {v.programName ?? 'Sin programa'}
                </span>
              </div>
              <span className="hidden sm:block w-1 h-1 rounded-full bg-slate-300" />
              <span className="text-slate-400 font-mono text-[11px]">#{v.id}</span>
            </div>
          </div>
        </div>
        {loading && (
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Cargando detalle…
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-7 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-6 space-y-6"
          >
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">
              Datos generales
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <Row label="Área" value={v.areaName ?? '—'} />
              <Row label="Escuela" value={v.schoolName ?? '—'} />
              <Row label="Programa" value={v.programName ?? '—'} />
              <Row label="Línea curricular" value={v.curricularLine ?? '—'} />
              <Row
                label="Nombre jefe inmediato"
                value={v.directManagerIdentification?.trim() || '—'}
              />
              <Row label="Cantidad" value={String(v.quantity)} />
              <Row label="Creado" value={formatTs(v.createdAt)} />
              <Row
                label="Tiempo activo"
                value={
                  v.sentToCapitalAt
                    ? formatVacancyActiveDaysLabel(computeVacancyActiveDays(v))
                    : 'SIN FECHA DE ENVÍO'
                }
                title={v.sentToCapitalAt ? vacancyActiveDaysTooltip(v) : undefined}
              />
              <Row label="Actualizado" value={formatTs(v.updatedAt)} />
              <Row label="Cierre" value={formatTs(v.closedAt)} />
            </dl>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-6 space-y-3"
          >
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">
              Observaciones
            </h3>
            <div className="space-y-3 text-sm text-slate-600">
              <p>
                <span className="text-[10px] font-bold uppercase text-slate-400 block mb-1">
                  Operación
                </span>
                {(v.operationNotes ?? []).length === 0 ? (
                  '—'
                ) : (
                  <ul className="space-y-2 mt-1">
                    {(v.operationNotes ?? []).map((n) => (
                      <li key={n.id} className="border-l-2 border-violet-200 pl-2">
                        <span className="text-[10px] text-slate-500">
                          {formatTs(n.createdAt)}
                          {n.createdByName ? ` · ${n.createdByName}` : ''}
                        </span>
                        <span className="block text-slate-700 whitespace-pre-wrap">{n.text}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </p>
            </div>
          </motion.div>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass-panel p-6"
          >
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <DocumentTextIcon className="h-4 w-4 text-violet-500" />
              Requisición
            </h3>
            {v.requisition == null ? (
              <p className="text-sm text-slate-500">Sin requisición asociada.</p>
            ) : (
              <dl className="space-y-2 text-sm">
                <Row
                  label="REQ"
                  value={
                    v.requisition.reqNumber?.trim()
                      ? v.requisition.reqNumber
                      : 'Pendiente'
                  }
                  mono
                />
                <Row label="Asignado" value={formatTs(v.requisition.assignedAt)} />
                <Row
                  label="Enviado a capital (opcional)"
                  value={
                    v.requisition.sentToCapitalAt
                      ? formatVacancyDateOnly(v.requisition.sentToCapitalAt)
                      : 'SIN FECHA DE ENVÍO'
                  }
                />
                <div>
                  <dt className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                    Notas capital humano
                  </dt>
                  <dd className="text-slate-700 whitespace-pre-wrap">
                    {v.requisition.capitalNotes?.trim()
                      ? v.requisition.capitalNotes
                      : '—'}
                  </dd>
                </div>
                <Row label="Terna" value={tri(v.requisition.shortlistComplied)} />
                <Row label="PDA" value={tri(v.requisition.pdaComplied)} />
                <Row
                  label="Condiciones contractuales"
                  value={tri(v.requisition.contractConditionsComplied)}
                />
                <Row
                  label="HV pre-entrevista"
                  value={tri(v.requisition.preInterviewCvComplied)}
                />
              </dl>
            )}
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-panel p-6"
          >
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
              <ClockIcon className="h-4 w-4 text-cyan-500" />
              Historial de estado
            </h3>
            {v.statusHistory.length ? (
              <ul className="space-y-4 text-sm">
                {v.statusHistory.map((h) => (
                  <li
                    key={h.id}
                    className="border-l-2 border-violet-200 pl-4 py-0.5"
                  >
                    <p className="font-bold text-slate-800 text-xs">
                      {h.previousOperationStatus ?? '(inicial)'} → {h.newOperationStatus}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatTs(h.changedAt)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-500">
                No hay cambios de estado registrados todavía.
              </p>
            )}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

function Row({
  label,
  value,
  mono,
  title,
}: {
  label: string;
  value: string;
  mono?: boolean;
  title?: string;
}) {
  return (
    <div>
      <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
        {label}
      </dt>
      <dd
        title={title}
        className={cn('text-slate-900 font-medium', mono && 'font-mono text-xs')}
      >
        {value}
      </dd>
    </div>
  );
}
