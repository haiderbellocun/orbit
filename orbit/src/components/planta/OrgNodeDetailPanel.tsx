import React, { useMemo } from 'react';
import {
  XMarkIcon,
  UserIcon,
  UsersIcon,
  PlusIcon,
  PencilSquareIcon,
  UserPlusIcon,
  ChevronRightIcon,
  EnvelopeIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { personInitials } from '@/src/lib/roleHierarchy';
import { schoolAccent } from '@/src/lib/schoolAccent';
import type { OrganizationNode } from '@/src/lib/organizationTree';
import { subtreeComposition } from '@/src/lib/orgChartNavigation';
import { SecondInCommandBadges } from '@/src/components/planta/SecondInCommandBadges';
import { UnitEmblem } from '@/src/components/planta/UnitEmblem';

export type OrgNodeDetailPanelProps = {
  node: OrganizationNode | null;
  /** Mismo nodo sin filtros: totales reales del equipo. */
  fullNode: OrganizationNode | null;
  parent: OrganizationNode | null;
  isFocused: boolean;
  filtersActive: boolean;
  canMutate: boolean;
  overlay: boolean;
  headingId?: string;
  closeRef?: React.Ref<HTMLButtonElement>;
  onClose: () => void;
  onExplore: () => void;
  onViewTeam: () => void;
  onManage: () => void;
  onAssign: () => void;
};

function Stat({
  icon,
  value,
  label,
  highlight,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-0.5 rounded-xl px-2 py-2 text-center',
        highlight && 'bg-orbit-success/10'
      )}
    >
      <span className="text-orbit-muted" aria-hidden>
        {icon}
      </span>
      <span className="font-display text-xl font-bold tabular-nums text-orbit-text">
        {value.toLocaleString('es-CO')}
      </span>
      <span className="text-[11px] leading-tight text-orbit-text-secondary">{label}</span>
    </div>
  );
}

export const OrgNodeDetailPanel: React.FC<OrgNodeDetailPanelProps> = ({
  node,
  fullNode,
  parent,
  isFocused,
  filtersActive,
  canMutate,
  overlay,
  headingId = 'org-detail-heading',
  closeRef,
  onClose,
  onExplore,
  onViewTeam,
  onManage,
  onAssign,
}) => {
  const composition = useMemo(
    () => (node ? subtreeComposition(node) : null),
    [node]
  );

  if (!node) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-orbit-border px-4 py-3">
          <h2 id={headingId} className="font-display text-base font-semibold text-orbit-text">
            Detalle
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar detalle"
            className="rounded-lg p-1.5 text-orbit-muted hover:bg-orbit-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
          >
            <XMarkIcon className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <p className="p-4 text-sm text-orbit-muted">
          Selecciona una tarjeta del organigrama para ver su detalle.
        </p>
      </div>
    );
  }

  const person = node.person;
  const tone = schoolAccent({
    schoolId: person.school_id,
    schoolName: person.school,
    areaName: person.area,
    roleName: person.role_name,
    personName: person.name,
  });
  const canEdit = person.can_edit === true;
  const hasTeam = node.children.length > 0;
  const fullTotal = fullNode?.totalReportsCount ?? node.totalReportsCount;
  const fullDirect = fullNode?.directReportsCount ?? node.directReportsCount;
  const leaderPct =
    composition && composition.total > 0
      ? Math.round((composition.leaders / composition.total) * 100)
      : 0;
  const managerName = parent?.person.name ?? person.manager_name ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-3 border-b border-orbit-border px-4 py-3">
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
          style={{ backgroundColor: tone.soft, color: tone.accent }}
          aria-hidden
        >
          {personInitials(person.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2
            id={headingId}
            className="font-display text-base font-semibold leading-snug text-orbit-text break-words"
          >
            {person.name}
          </h2>
          <p className="text-xs text-orbit-text-secondary">
            {person.role_name || 'Sin cargo'}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            <span
              className={cn(
                'rounded-md px-1.5 py-0.5 text-[10px] font-bold',
                person.status === 'active'
                  ? 'bg-orbit-success/10 text-orbit-success'
                  : 'bg-orbit-interactive text-orbit-muted'
              )}
            >
              {person.status === 'active' ? 'Activo' : 'Inactivo'}
            </span>
            {node.isContextOnly && (
              <span className="rounded-md bg-orbit-interactive px-1.5 py-0.5 text-[10px] font-bold text-orbit-muted">
                Contexto · no coincide con filtros
              </span>
            )}
            {node.assignmentLabel && (
              <span className="rounded-md bg-orbit-warning/10 px-1.5 py-0.5 text-[10px] font-bold text-orbit-warning">
                {node.assignmentLabel}
              </span>
            )}
          </div>
        </div>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Cerrar detalle"
          className="shrink-0 rounded-lg p-1.5 text-orbit-muted hover:bg-orbit-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
        >
          <XMarkIcon className="h-5 w-5" aria-hidden />
        </button>
      </div>

      {/* El detalle puede desplazarse sin mover el gráfico. */}
      <div className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3', overlay && 'pb-6')}>
        <dl className="space-y-2.5 text-sm">
          <div className="flex items-start gap-2.5">
            <UserIcon className="mt-0.5 h-4 w-4 shrink-0 text-orbit-muted" aria-hidden />
            <div className="min-w-0">
              <dt className="text-[11px] text-orbit-muted">Responsable directo</dt>
              <dd className="font-medium text-orbit-text break-words">
                {managerName ?? 'Sin responsable asignado'}
              </dd>
            </div>
          </div>
          {(person.school || person.area) && (
            <div className="flex items-start gap-2.5">
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: tone.accent }}
                aria-hidden
              />
              <div className="min-w-0">
                <dt className="text-[11px] text-orbit-muted">Unidad</dt>
                <dd className="text-orbit-text break-words">
                  {[person.area, person.school, person.program]
                    .map((v) => v?.trim())
                    .filter((v, i, all): v is string => Boolean(v) && all.indexOf(v) === i)
                    .join(' · ')}
                </dd>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2.5">
            <EnvelopeIcon className="mt-0.5 h-4 w-4 shrink-0 text-orbit-muted" aria-hidden />
            <div className="min-w-0">
              <dt className="text-[11px] text-orbit-muted">Correo CUN</dt>
              <dd
                className={cn(
                  'break-all',
                  person.edu_email?.trim() ? 'text-orbit-text' : 'font-semibold text-orbit-danger'
                )}
              >
                {person.edu_email?.trim() || 'Sin correo CUN'}
              </dd>
            </div>
          </div>
        </dl>
        <SecondInCommandBadges person={person} />

        <div className="flex justify-center">
          <UnitEmblem subject={person} />
        </div>

        {(hasTeam || fullDirect > 0) && (
          <section aria-label="Conteos del equipo" className="space-y-3">
            <div className="grid grid-cols-3 gap-1 border-y border-orbit-border py-2">
              <Stat
                icon={<UsersIcon className="h-4 w-4" />}
                value={node.leaderCount}
                label="líderes directos"
              />
              <Stat
                icon={<UserIcon className="h-4 w-4" />}
                value={node.directReportsCount}
                label="reportes directos"
              />
              <Stat
                icon={<UsersIcon className="h-4 w-4" />}
                value={node.totalReportsCount}
                label="equipo total"
                highlight
              />
            </div>
            {filtersActive && fullTotal !== node.totalReportsCount && (
              <p className="text-[11px] text-orbit-muted">
                Con filtros. Sin filtros: {fullDirect.toLocaleString('es-CO')} reportes
                directos y {fullTotal.toLocaleString('es-CO')} personas en total.
              </p>
            )}
            {composition && composition.total > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-orbit-text">
                  Composición del equipo total
                </h3>
                <div
                  className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-orbit-interactive"
                  role="img"
                  aria-label={`${composition.leaders} líderes y ${composition.collaborators} colaboradores`}
                >
                  <span
                    className="h-full bg-orbit-primary"
                    style={{ width: `${leaderPct}%` }}
                  />
                  <span className="h-full flex-1 bg-orbit-info/70" />
                </div>
                <div className="mt-1.5 flex flex-wrap justify-between gap-2 text-[11px] text-orbit-text-secondary">
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-orbit-primary" aria-hidden />
                    {leaderPct}% líderes ({composition.leaders.toLocaleString('es-CO')})
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-orbit-info/70" aria-hidden />
                    {100 - leaderPct}% colaboradores (
                    {composition.collaborators.toLocaleString('es-CO')})
                  </span>
                </div>
              </div>
            )}
          </section>
        )}

        <div className="space-y-2">
          {hasTeam && !isFocused && (
            <button
              type="button"
              onClick={onExplore}
              className="glass-button-primary w-full px-3 py-2 text-sm"
            >
              <PlusIcon className="h-4 w-4" aria-hidden />
              Explorar equipo
            </button>
          )}
          {hasTeam && (
            <button
              type="button"
              onClick={onViewTeam}
              className="flex w-full items-center gap-2 rounded-xl border border-orbit-border px-3 py-2 text-left text-sm font-semibold text-orbit-text hover:bg-orbit-interactive focus:outline-none focus-visible:ring-2 focus-visible:ring-orbit-primary"
            >
              <UsersIcon className="h-4 w-4 text-orbit-muted" aria-hidden />
              <span className="flex-1">Ver equipo completo</span>
              <ChevronRightIcon className="h-4 w-4 text-orbit-muted" aria-hidden />
            </button>
          )}
          {canEdit ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onManage}
                className="glass-button-secondary flex-1 px-3 py-2 text-sm"
              >
                <PencilSquareIcon className="h-4 w-4" aria-hidden />
                Gestionar
              </button>
              {canMutate && (
                <button
                  type="button"
                  onClick={onAssign}
                  className="glass-button-secondary flex-1 px-3 py-2 text-sm"
                >
                  <UserPlusIcon className="h-4 w-4" aria-hidden />
                  Asignar
                </button>
              )}
            </div>
          ) : (
            <p className="text-center text-xs text-orbit-muted">Solo lectura</p>
          )}
        </div>
      </div>
    </div>
  );
};
