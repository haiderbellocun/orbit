import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import {
  TEACHER_ALERTS,
  TEACHER_ALERT_KEYS,
  alertChipLabel,
  alertChipTitle,
  type AlertsSummary,
  type TeacherAlertInfo,
  type TeacherAlertKey,
} from '@/src/lib/teacherAlerts';

/**
 * Panel con el conteo de cada alerta. Clic en una alerta = filtrar por ella
 * (otro clic la quita). Se usa en Carga Académica y en Balance carga.
 */
export function TeacherAlertsPanel({
  summary,
  active,
  onChange,
  periodChosen,
}: {
  summary: AlertsSummary;
  active: TeacherAlertKey | null;
  onChange: (next: TeacherAlertKey | null) => void;
  /** Sin periodo, la sobrecarga suma todos los periodos: se avisa. */
  periodChosen: boolean;
}) {
  return (
    <div className="relative z-10 rounded-2xl border border-orbit-border bg-orbit-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
          Alertas de los docentes
        </h3>
        {active && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="inline-flex items-center gap-1 text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
          >
            <XMarkIcon className="h-3.5 w-3.5" />
            Quitar filtro de alerta
          </button>
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {TEACHER_ALERT_KEYS.map((key) => {
          const meta = TEACHER_ALERTS[key];
          const value = summary[key];
          const isActive = active === key;
          return (
            <button
              key={key}
              type="button"
              disabled={value === 0 && !isActive}
              aria-pressed={isActive}
              title={meta.description}
              onClick={() => onChange(isActive ? null : key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-default disabled:opacity-45',
                isActive ? meta.active : cn(meta.chip, 'hover:brightness-95')
              )}
            >
              <span className="font-display text-lg font-bold leading-none">
                {value.toLocaleString('es-CO')}
              </span>
              {meta.label}
            </button>
          );
        })}
      </div>
      {!periodChosen && (
        <p className="mt-2 text-[11px] text-orbit-muted">
          Sin periodo elegido, la sobrecarga suma la cátedra de todos los periodos. Filtra un
          periodo para ver la sobrecarga real.
        </p>
      )}
    </div>
  );
}

/** Chips de alerta de un docente (la sobrecarga muestra cuántas horas se pasa). */
export function TeacherAlertChips({
  info,
  hide = [],
  className,
}: {
  info: TeacherAlertInfo | null | undefined;
  /** Alertas que ya se muestran de otra forma en la fila. */
  hide?: TeacherAlertKey[];
  className?: string;
}) {
  const keys = (info?.alerts ?? []).filter((k) => !hide.includes(k));
  if (keys.length === 0) return null;
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {keys.map((key) => (
        <span
          key={key}
          title={alertChipTitle(key, info)}
          className={cn(
            'inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[10px] font-bold',
            TEACHER_ALERTS[key].chip
          )}
        >
          {alertChipLabel(key, info)}
        </span>
      ))}
    </div>
  );
}
