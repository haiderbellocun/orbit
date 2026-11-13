import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  MapPinIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { PlantaPerson } from '@/src/types';
import { personMatchesQuery } from '@/src/lib/organizationTree';
import { SecondInCommandBadges } from '@/src/components/planta/SecondInCommandBadges';

export type TeamListRow = {
  key: string;
  person: PlantaPerson;
  managerName: string | null;
  /** Clave del nodo en el gráfico; si existe se ofrece "Ver en gráfico". */
  nodeKey?: string | null;
  contextOnly?: boolean;
};

type TeamListViewProps = {
  title: string;
  subtitle?: string;
  rows: TeamListRow[];
  emptyMessage: string;
  onBack?: () => void;
  backLabel?: string;
  onManage: (personId: string) => void;
  onShowInChart?: (nodeKey: string) => void;
  initialQuery?: string;
};

const PAGE_SIZE = 25;

export const TeamListView: React.FC<TeamListViewProps> = ({
  title,
  subtitle,
  rows,
  emptyMessage,
  onBack,
  backLabel = 'Volver al gráfico',
  onManage,
  onShowInChart,
  initialQuery = '',
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [page, setPage] = useState(0);

  useEffect(() => setQuery(initialQuery), [initialQuery]);

  const filtered = useMemo(
    () => rows.filter((r) => personMatchesQuery(r.person, query)),
    [rows, query]
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => setPage(0), [query, rows]);

  return (
    <section
      aria-labelledby="team-list-heading"
      className="glass-panel flex h-full min-h-0 min-w-0 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-orbit-border px-4 py-2.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1 rounded-lg border border-orbit-border px-2 py-1 text-xs font-semibold text-orbit-text-secondary hover:bg-orbit-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
          >
            <ArrowLeftIcon className="h-3.5 w-3.5" aria-hidden />
            {backLabel}
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2
            id="team-list-heading"
            tabIndex={-1}
            className="truncate font-display text-base font-semibold text-orbit-text focus:outline-none"
          >
            {title}
          </h2>
          {subtitle && <p className="truncate text-xs text-orbit-muted">{subtitle}</p>}
        </div>
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Buscar en esta lista</span>
          <MagnifyingGlassIcon
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-orbit-muted"
            aria-hidden
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nombre, correo o cédula…"
            className="glass-input !py-1.5 pl-8 text-sm"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-orbit-muted">{emptyMessage}</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 z-10 bg-orbit-surface">
              <tr className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                <th scope="col" className="px-4 py-2">Persona</th>
                <th scope="col" className="hidden px-2 py-2 md:table-cell">Cargo</th>
                <th scope="col" className="hidden px-2 py-2 lg:table-cell">Responsable directo</th>
                <th scope="col" className="hidden px-2 py-2 sm:table-cell">Estado</th>
                <th scope="col" className="px-4 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const p = row.person;
                return (
                  <tr key={row.key} className={cn('border-t border-orbit-border/80 align-top', row.contextOnly && 'opacity-70')}>
                    <td className="px-4 py-2">
                      <p className="font-semibold text-orbit-text">{p.name || '—'}</p>
                      <p className="text-xs text-orbit-muted md:hidden">{p.role_name || 'Sin rol'}</p>
                      <p className="text-xs text-orbit-muted">{p.document || 'Sin identificación'}</p>
                      <SecondInCommandBadges person={p} />
                    </td>
                    <td className="hidden px-2 py-2 text-orbit-text-secondary md:table-cell">
                      {p.role_name || 'Sin rol'}
                    </td>
                    <td className="hidden px-2 py-2 text-orbit-text-secondary lg:table-cell">
                      {row.managerName || '—'}
                    </td>
                    <td className="hidden px-2 py-2 sm:table-cell">
                      <span className={cn('text-xs font-semibold', p.status === 'active' ? 'text-orbit-success' : 'text-orbit-muted')}>
                        {p.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <div className="inline-flex flex-wrap justify-end gap-x-3 gap-y-1">
                        {onShowInChart && row.nodeKey && (
                          <button
                            type="button"
                            onClick={() => onShowInChart(row.nodeKey!)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-orbit-text-secondary hover:text-orbit-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
                            aria-label={`Ver a ${p.name} en el gráfico`}
                          >
                            <MapPinIcon className="h-3.5 w-3.5" aria-hidden />
                            Ver en gráfico
                          </button>
                        )}
                        {p.can_edit === true ? (
                          <button
                            type="button"
                            onClick={() => onManage(p.id)}
                            className="inline-flex items-center gap-1 text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
                            aria-label={`Gestionar a ${p.name}`}
                          >
                            <PencilSquareIcon className="h-3.5 w-3.5" aria-hidden />
                            Gestionar
                          </button>
                        ) : (
                          <span className="text-xs text-orbit-muted">Solo lectura</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-t border-orbit-border px-4 text-xs text-orbit-text-secondary">
        <span className="tabular-nums">
          {filtered.length === 0
            ? '0 personas'
            : `${safePage * PAGE_SIZE + 1}–${safePage * PAGE_SIZE + pageRows.length} de ${filtered.length.toLocaleString('es-CO')} personas`}
        </span>
        {pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-orbit-interactive disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            >
              <ChevronLeftIcon className="h-4 w-4" aria-hidden />
              Anterior
            </button>
            <select
              value={safePage}
              onChange={(e) => setPage(Number(e.target.value))}
              aria-label={`Ir a página, ${pageCount} en total`}
              className="rounded-md border border-orbit-border bg-orbit-bg-secondary px-1.5 py-0.5 text-xs text-orbit-text focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            >
              {Array.from({ length: pageCount }, (_, i) => (
                <option key={i} value={i}>
                  {i + 1} de {pageCount}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={safePage >= pageCount - 1}
              onClick={() => setPage(safePage + 1)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold hover:bg-orbit-interactive disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            >
              Siguiente
              <ChevronRightIcon className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
