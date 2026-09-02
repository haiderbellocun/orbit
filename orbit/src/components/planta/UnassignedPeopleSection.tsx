import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ExclamationTriangleIcon,
  UserPlusIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { PlantaPerson } from '@/src/types';
import { CollaboratorTable } from '@/src/components/planta/CollaboratorTable';
import type { OrganizationNode } from '@/src/lib/organizationTree';
import { getRoleBand, getRoleHierarchyLevel } from '@/src/lib/roleHierarchy';
import { downloadUnassignedPeopleExcel } from '@/src/lib/exportUnassignedPeopleExcel';

type UnassignedPeopleSectionProps = {
  people: PlantaPerson[];
  onManage: (personId: string) => void;
  defaultOpen?: boolean;
  heading?: string;
  hint?: string;
  tone?: 'warning' | 'muted';
  canBulkAssign?: boolean;
  onBulkAssign?: (personIds: string[]) => void;
};

const PAGE_SIZE = 40;

function toNodes(people: PlantaPerson[]): OrganizationNode[] {
  return people.map((person) => ({
    person,
    nodeKey: `person:${person.id}`,
    relationId: null,
    parentPersonId: null,
    visualLevel: null,
    assignmentStatus: null,
    assignmentLabel: null,
    hierarchyLevel: getRoleHierarchyLevel({
      roleName: person.role_name,
      roleCode: person.role_code,
    }),
    band: getRoleBand({
      roleName: person.role_name,
      roleCode: person.role_code,
    }),
    children: [],
    directReportsCount: 0,
    totalReportsCount: 0,
    leaderCount: 0,
  }));
}

export const UnassignedPeopleSection: React.FC<
  UnassignedPeopleSectionProps
> = ({
  people,
  onManage,
  defaultOpen = false,
  heading = 'Sin responsable asignado',
  hint,
  tone = 'warning',
  canBulkAssign = false,
  onBulkAssign,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [exporting, setExporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    setPage(1);
    setSelected(new Set());
  }, [people]);

  const totalPages = Math.max(1, Math.ceil(people.length / PAGE_SIZE));
  const pagePeople = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return people.slice(start, start + PAGE_SIZE);
  }, [people, page]);

  const pageIds = useMemo(
    () => pagePeople.map((p) => p.id),
    [pagePeople]
  );
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  if (people.length === 0) return null;

  function handleExport(e: React.MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    setExporting(true);
    try {
      downloadUnassignedPeopleExcel(people, { title: heading });
    } finally {
      setExporting(false);
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        for (const id of pageIds) next.delete(id);
      } else {
        for (const id of pageIds) next.add(id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelected(new Set(people.map((p) => p.id)));
  }

  function clearSelected() {
    setSelected(new Set());
  }

  return (
    <section
      className={cn(
        'rounded-2xl border bg-orbit-surface overflow-hidden',
        tone === 'warning'
          ? 'border-orbit-warning/30'
          : 'border-orbit-border'
      )}
    >
      <div className="flex w-full items-center gap-2 px-4 py-4 sm:gap-3 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          {tone === 'warning' ? (
            <ExclamationTriangleIcon className="h-5 w-5 shrink-0 text-orbit-warning" />
          ) : null}
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-semibold text-orbit-text">
              {heading}
            </h3>
            <p className="text-sm text-orbit-muted">
              {hint ??
                `${people.length.toLocaleString('es-CO')} persona${
                  people.length === 1 ? '' : 's'
                } sin responsable asignado`}
            </p>
          </div>
          <span className="hidden text-xs font-bold text-orbit-primary sm:inline">
            {open ? 'Ocultar' : 'Ver personas'}
          </span>
          <ChevronDownIcon
            className={cn(
              'h-4 w-4 shrink-0 text-orbit-muted transition-transform',
              open && 'rotate-180'
            )}
          />
        </button>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || people.length === 0}
          className="glass-button-secondary inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-xs font-bold disabled:opacity-40"
          title="Exportar Excel"
        >
          <ArrowDownTrayIcon className="h-4 w-4" />
          <span className="hidden sm:inline">
            {exporting ? 'Generando…' : 'Excel'}
          </span>
        </button>
      </div>
      {open && (
        <div className="border-t border-orbit-border px-4 pb-4 sm:px-5 space-y-3">
          {canBulkAssign && onBulkAssign ? (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-2 text-xs font-bold text-orbit-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={allPageSelected}
                    onChange={togglePage}
                    className="rounded border-orbit-border text-orbit-primary focus:ring-violet-400"
                  />
                  Página
                </label>
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
                >
                  Todas ({people.length})
                </button>
                {selected.size > 0 && (
                  <button
                    type="button"
                    onClick={clearSelected}
                    className="text-xs font-bold text-orbit-muted hover:text-orbit-text"
                  >
                    Limpiar
                  </button>
                )}
                <span className="text-xs text-orbit-muted">
                  {selected.size.toLocaleString('es-CO')} seleccionada
                  {selected.size === 1 ? '' : 's'}
                </span>
              </div>
              <button
                type="button"
                disabled={selected.size === 0}
                onClick={() => onBulkAssign([...selected])}
                className="glass-button-primary inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold disabled:opacity-40"
              >
                <UserPlusIcon className="h-4 w-4" />
                Asignar a un líder
              </button>
            </div>
          ) : null}

          <CollaboratorTable
            nodes={toNodes(pagePeople)}
            onManage={onManage}
            selectable={canBulkAssign}
            selectedIds={selected}
            onToggleSelect={canBulkAssign ? toggleOne : undefined}
          />
          {totalPages > 1 && (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="text-xs font-bold text-orbit-muted">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
