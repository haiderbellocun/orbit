import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronDownIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { PlantaPerson } from '@/src/types';
import { CollaboratorTable } from '@/src/components/planta/CollaboratorTable';
import type { OrganizationNode } from '@/src/lib/organizationTree';
import { getRoleBand, getRoleHierarchyLevel } from '@/src/lib/roleHierarchy';

type UnassignedPeopleSectionProps = {
  people: PlantaPerson[];
  onManage: (personId: string) => void;
  defaultOpen?: boolean;
  heading?: string;
  hint?: string;
  tone?: 'warning' | 'muted';
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
}) => {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(people.length / PAGE_SIZE));
  const pagePeople = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return people.slice(start, start + PAGE_SIZE);
  }, [people, page]);

  if (people.length === 0) return null;

  return (
    <section
      className={cn(
        'rounded-2xl border bg-orbit-surface overflow-hidden',
        tone === 'warning'
          ? 'border-orbit-warning/30'
          : 'border-orbit-border'
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-4 text-left sm:px-5"
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
        <span className="text-xs font-bold text-orbit-primary">
          {open ? 'Ocultar' : 'Ver personas'}
        </span>
        <ChevronDownIcon
          className={cn(
            'h-4 w-4 text-orbit-muted transition-transform',
            open && 'rotate-180'
          )}
        />
      </button>
      {open && (
        <div className="border-t border-orbit-border px-4 pb-4 sm:px-5">
          <CollaboratorTable nodes={toNodes(pagePeople)} onManage={onManage} />
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
