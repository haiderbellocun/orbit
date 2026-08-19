import React, { useMemo } from 'react';
import { ChartBarIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { Vacancy, VacancyOperationStatus } from '@/src/types';
import { STATUS_LABEL } from '@/src/lib/vacancyFormHelpers';

const STATUS_ORDER: VacancyOperationStatus[] = [
  'open',
  'selected',
  'requisition_sent',
  'internal_movement',
  'hired',
  'closed',
  'cancelled',
  'cancelled_by_capital',
];

const STATUS_BAR: Record<
  VacancyOperationStatus,
  { bar: string; track: string; qty: string }
> = {
  open: {
    bar: 'bg-blue-500',
    track: 'bg-blue-50',
    qty: 'bg-blue-300',
  },
  selected: {
    bar: 'bg-amber-500',
    track: 'bg-amber-50',
    qty: 'bg-amber-300',
  },
  requisition_sent: {
    bar: 'bg-violet-500',
    track: 'bg-violet-50',
    qty: 'bg-violet-300',
  },
  internal_movement: {
    bar: 'bg-cyan-500',
    track: 'bg-cyan-50',
    qty: 'bg-cyan-300',
  },
  hired: {
    bar: 'bg-emerald-500',
    track: 'bg-emerald-50',
    qty: 'bg-emerald-300',
  },
  closed: {
    bar: 'bg-slate-500',
    track: 'bg-slate-100',
    qty: 'bg-slate-300',
  },
  cancelled: {
    bar: 'bg-slate-400',
    track: 'bg-slate-100',
    qty: 'bg-slate-300',
  },
  cancelled_by_capital: {
    bar: 'bg-rose-500',
    track: 'bg-rose-50',
    qty: 'bg-rose-300',
  },
};

const numberFormatter = new Intl.NumberFormat('es-CO');

type VacancyStatusChartProps = {
  vacancies: Vacancy[];
  loading?: boolean;
  activeStatus?: VacancyOperationStatus | '';
  onSelectStatus?: (status: VacancyOperationStatus | '') => void;
};

export const VacancyStatusChart: React.FC<VacancyStatusChartProps> = ({
  vacancies,
  loading = false,
  activeStatus = '',
  onSelectStatus,
}) => {
  const series = useMemo(() => {
    const map = new Map<
      VacancyOperationStatus,
      { count: number; quantity: number }
    >();
    for (const s of STATUS_ORDER) map.set(s, { count: 0, quantity: 0 });
    for (const v of vacancies) {
      const cur = map.get(v.operationStatus);
      if (!cur) continue;
      cur.count += 1;
      cur.quantity += v.quantity ?? 0;
    }
    return STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABEL[status],
      ...(map.get(status) ?? { count: 0, quantity: 0 }),
    }));
  }, [vacancies]);

  const maxValue = Math.max(
    1,
    ...series.flatMap((s) => [s.count, s.quantity])
  );

  const totalCount = series.reduce((n, s) => n + s.count, 0);
  const totalQty = series.reduce((n, s) => n + s.quantity, 0);

  return (
    <section className="glass-card p-6 relative z-10">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center bg-violet-50/80 text-violet-600 border border-violet-100/80 shadow-inner shrink-0">
            <ChartBarIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-slate-900 font-display">
              Vacantes por estado
            </h2>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Barras horizontales para comparar volumen por categoría. Pulsa un
              estado para filtrar la tabla.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-medium text-slate-500 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-violet-500" />
            Vacantes
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm bg-violet-300" />
            Personas solicitadas
          </span>
          <span className="tabular-nums text-slate-400">
            {loading
              ? '—'
              : `${numberFormatter.format(totalCount)} · ${numberFormatter.format(totalQty)} solic.`}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="h-48 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
        </div>
      ) : totalCount === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          No hay vacantes para graficar con los filtros actuales.
        </p>
      ) : (
        <ul className="space-y-3">
          {series.map((row) => {
            const countPct = Math.max(
              row.count > 0 ? 4 : 0,
              (row.count / maxValue) * 100
            );
            const qtyPct = Math.max(
              row.quantity > 0 ? 4 : 0,
              (row.quantity / maxValue) * 100
            );
            const colors = STATUS_BAR[row.status];
            const isActive = activeStatus === row.status;
            const disabled = row.count === 0 && !isActive;

            return (
              <li key={row.status}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onSelectStatus?.(isActive ? '' : row.status)
                  }
                  className={cn(
                    'w-full text-left rounded-xl px-2 py-1.5 -mx-2 transition-colors',
                    isActive && 'bg-violet-50/80 ring-1 ring-violet-200/80',
                    !disabled && !isActive && 'hover:bg-slate-50/80',
                    disabled && 'opacity-40 cursor-default'
                  )}
                  title={
                    disabled
                      ? undefined
                      : isActive
                        ? 'Quitar filtro de estado'
                        : `Filtrar por ${row.label}`
                  }
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <span className="text-[12px] font-bold text-slate-700 truncate">
                      {row.label}
                    </span>
                    <span className="text-[11px] tabular-nums text-slate-500 shrink-0">
                      {numberFormatter.format(row.count)} vac.{' '}
                      <span className="text-slate-400">·</span>{' '}
                      {numberFormatter.format(row.quantity)} solic.
                    </span>
                  </div>
                  <div className="space-y-1">
                    <div className={cn('h-2.5 rounded-full overflow-hidden', colors.track)}>
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', colors.bar)}
                        style={{ width: `${countPct}%` }}
                      />
                    </div>
                    <div className={cn('h-2 rounded-full overflow-hidden', colors.track)}>
                      <div
                        className={cn('h-full rounded-full transition-all duration-500', colors.qty)}
                        style={{ width: `${qtyPct}%` }}
                      />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};
