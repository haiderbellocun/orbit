import { SecondInCommandBadges } from './SecondInCommandBadges';
import React from 'react';
import {
  ChevronDownIcon,
  PencilSquareIcon,
  UserPlusIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { getRoleBand, personInitials } from '@/src/lib/roleHierarchy';
import { schoolAccent, type SchoolAccent } from '@/src/lib/schoolAccent';
import {
  isBranchNode,
  splitReports,
  type OrganizationNode,
} from '@/src/lib/organizationTree';
import { LeaderNode } from '@/src/components/planta/LeaderNode';
import { CollaboratorTable } from '@/src/components/planta/CollaboratorTable';

type CoordinatorNodeProps = {
  node: OrganizationNode;
  expandedIds: Set<string>;
  onToggle: (nodeKey: string) => void;
  onManage: (personId: string) => void;
  onAssign: (personId: string) => void;
  canMutate?: boolean;
  variant?: 'apex' | 'default';
  parentAccent?: SchoolAccent | null;
  siblingIndex?: number;
};

export const CoordinatorNode: React.FC<CoordinatorNodeProps> = React.memo(
  ({
    node,
    expandedIds,
    onToggle,
    onManage,
    onAssign,
    canMutate = true,
    variant = 'default',
    parentAccent = null,
    siblingIndex,
  }) => {
    const person = node.person;
    const isApex = variant === 'apex';
    const expanded = isApex || expandedIds.has(node.nodeKey);
    const { nested, collaborators } = splitReports(node);
    const canEdit = person.can_edit === true;
    const canExpand = true;
    const tone = schoolAccent(
      {
        schoolId: person.school_id,
        schoolName: person.school,
        programName: person.program,
        areaName: person.area,
        roleName: person.role_name,
        personName: person.name,
      },
      parentAccent,
      siblingIndex
    );

    return (
      <article
        className={cn(
          'overflow-hidden rounded-2xl border',
          isApex ? 'p-1' : 'bg-orbit-surface'
        )}
        style={{
          borderColor: tone.border,
          borderLeftWidth: isApex ? 6 : 4,
          borderLeftColor: tone.accent,
          backgroundColor: isApex ? tone.soft : undefined,
        }}
      >
        <div
          className={cn(
            'flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5',
            isApex && 'rounded-xl bg-orbit-surface m-3 mb-0',
            canExpand && !isApex && 'cursor-pointer',
            node.isContextOnly && 'opacity-80'
          )}
          onClick={isApex ? undefined : () => onToggle(node.nodeKey)}
          role={isApex ? undefined : 'button'}
          aria-expanded={isApex ? undefined : expanded}
        >
          <div
            className="h-12 w-12 shrink-0 rounded-xl flex items-center justify-center text-sm font-bold"
            style={{ backgroundColor: tone.soft, color: tone.accent }}
          >
            {personInitials(person.name)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
              {person.role_name || 'Coordinador'}
            </p>
            <h3 className="font-display text-lg font-semibold tracking-tight text-orbit-text">
              {person.name}
            </h3>
            <SecondInCommandBadges person={person} />
            {node.assignmentLabel ? (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-orbit-warning">
                {node.assignmentLabel}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-orbit-text-secondary">
              {person.area || 'Sin área'}
            </p>
            <p
              className="mt-0.5 text-sm font-semibold truncate"
              style={{ color: tone.accent }}
            >
              {person.school || person.program || 'Sin programa'}
            </p>
            {person.edu_email?.trim() ? (
              <p className="text-xs text-orbit-muted truncate">
                {person.edu_email}
              </p>
            ) : (
              <p className="text-xs font-semibold text-orbit-danger">
                Sin correo CUN
              </p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-orbit-text-secondary">
              <span>
                <strong className="font-semibold text-orbit-text">
                  {node.leaderCount}
                </strong>{' '}
                {node.leaderCount === 1 ? 'líder' : 'líderes'}
              </span>
              <span>
                <strong className="font-semibold text-orbit-text">
                  {node.totalReportsCount}
                </strong>{' '}
                colaborador{node.totalReportsCount === 1 ? '' : 'es'}
              </span>
              <span
                className={cn(
                  'text-xs font-semibold',
                  person.status === 'active'
                    ? 'text-orbit-success'
                    : 'text-orbit-muted'
                )}
              >
                {person.status === 'active' ? 'Activo' : 'Inactivo'}
              </span>
            </div>
          </div>
          <div
            className="flex shrink-0 items-center gap-2 self-end sm:self-start"
            onClick={(e) => e.stopPropagation()}
          >
            {canEdit && canMutate ? (
              <button
                type="button"
                onClick={() => onAssign(person.id)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-orbit-primary hover:bg-orbit-primary/10"
                title="Asignar varios colaboradores de una vez"
              >
                <UserPlusIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Asignar</span>
              </button>
            ) : null}
            {canEdit ? (
              <button
                type="button"
                onClick={() => onManage(person.id)}
                className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-orbit-primary hover:bg-orbit-primary/10"
              >
                <PencilSquareIcon className="h-4 w-4" />
                Gestionar
              </button>
            ) : (
              <span className="text-xs text-orbit-muted">Solo lectura</span>
            )}
            {!isApex && (
            <button
              type="button"
              onClick={() => onToggle(node.nodeKey)}
              className="rounded-xl p-2 text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text"
              aria-label={expanded ? 'Contraer' : 'Expandir'}
            >
              <ChevronDownIcon
                className={cn(
                  'h-5 w-5 transition-transform',
                  expanded && 'rotate-180'
                )}
              />
            </button>
            )}
          </div>
        </div>

        {expanded && (
          <div
            className={cn(
              'px-4 py-4 sm:px-6',
              isApex
                ? 'pt-3'
                : 'border-t border-orbit-border bg-orbit-bg-secondary/40'
            )}
          >
            {node.children.length === 0 ? (
              <div className="rounded-xl border border-dashed border-orbit-border bg-orbit-surface px-4 py-6 text-sm text-orbit-muted">
                <p>Este coordinador aún no tiene equipo asignado.</p>
                {canEdit && canMutate && (
                  <button
                    type="button"
                    onClick={() => onAssign(person.id)}
                    className="mt-2 text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
                  >
                    Asignar colaboradores
                  </button>
                )}
              </div>
            ) : (
              <div className="relative space-y-3 pl-3 sm:pl-5">
                <div
                  className="absolute bottom-2 left-0 top-2 w-px"
                  style={{ backgroundColor: tone.border }}
                  aria-hidden
                />
                {nested.map((child, index) => {
                  const band = getRoleBand({
                    roleName: child.person.role_name,
                    roleCode: child.person.role_code,
                  });
                  if (band === 'coordinator') {
                    return (
                      <CoordinatorNode
                        key={child.nodeKey}
                        node={child}
                        expandedIds={expandedIds}
                        onToggle={onToggle}
                        onManage={onManage}
                        onAssign={onAssign}
                        canMutate={canMutate}
                        parentAccent={tone}
                        siblingIndex={index}
                      />
                    );
                  }
                  if (isBranchNode(child)) {
                    return (
                      <LeaderNode
                        key={child.nodeKey}
                        node={child}
                        expandedIds={expandedIds}
                        onToggle={onToggle}
                        onManage={onManage}
                        onAssign={onAssign}
                        canMutate={canMutate}
                        parentAccent={tone}
                        siblingIndex={index}
                      />
                    );
                  }
                  return null;
                })}
                {collaborators.length > 0 && (
                  <div className="rounded-xl border border-orbit-border bg-orbit-surface px-3 py-2 sm:px-4">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                      Personal directamente asignado
                    </p>
                    <CollaboratorTable
                      nodes={collaborators}
                      onManage={onManage}
                      parentAccent={tone}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </article>
    );
  }
);

CoordinatorNode.displayName = 'CoordinatorNode';
