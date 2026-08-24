import React, { useEffect, useState } from 'react';
import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/solid';
import {
  getWorkforceEventStatusLog,
  type WorkforceEventStatus,
  type WorkforceEventStatusLog,
} from '@/src/lib/api';
import { WORKFORCE_EVENT_STATUS_LABELS } from '@/src/lib/workforceEventLabels';
import { cn } from '@/src/lib/utils';

function formatLogDate(iso: string) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function statusTransition(log: WorkforceEventStatusLog): string {
  const prev =
    log.previous_status == null
      ? 'Registro inicial'
      : WORKFORCE_EVENT_STATUS_LABELS[log.previous_status as WorkforceEventStatus];
  const next = WORKFORCE_EVENT_STATUS_LABELS[log.new_status];
  return `${prev} → ${next}`;
}

type WorkforceEventStatusHistoryProps = {
  eventId: string;
  className?: string;
};

export const WorkforceEventStatusHistory: React.FC<
  WorkforceEventStatusHistoryProps
> = ({ eventId, className }) => {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<WorkforceEventStatusLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void getWorkforceEventStatusLog(eventId)
      .then((data) => {
        if (!cancelled) setLogs(data);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'No se pudo cargar el historial');
          setLogs([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  return (
    <div className={cn('mt-2', className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-orbit-primary hover:text-orbit-primary-hover"
      >
        {open ? (
          <ChevronUpIcon className="h-3.5 w-3.5" />
        ) : (
          <ChevronDownIcon className="h-3.5 w-3.5" />
        )}
        Historial de estado
      </button>

      {open ? (
        <div className="mt-2 rounded-xl border border-orbit-border bg-orbit-bg-secondary/80 px-3 py-2">
          {loading ? (
            <p className="text-xs text-orbit-muted">Cargando…</p>
          ) : error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : logs.length === 0 ? (
            <p className="text-xs text-orbit-muted">Sin cambios registrados.</p>
          ) : (
            <ul className="space-y-2">
              {logs.map((log) => (
                <li key={log.id} className="text-xs text-orbit-text-secondary">
                  <span className="font-semibold text-orbit-text">
                    {statusTransition(log)}
                  </span>
                  <span className="text-orbit-muted">
                    {' '}
                    · {log.changed_by_person.name} · {formatLogDate(log.changed_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
};
