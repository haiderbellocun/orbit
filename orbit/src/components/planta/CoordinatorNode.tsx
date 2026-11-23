import { displayCase } from '@/src/lib/displayText';
import React from 'react';
import {
  ChevronDownIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { getRoleBand, personInitials } from '@/src/lib/roleHierarchy';
import { TeamSummary } from '@/src/components/planta/TeamSummary';
import { FocusInWheelButton } from '@/src/components/planta/radial/PlantaWheelContext';
import { schoolAccent } from '@/src/lib/schoolAccent';
import {
  isBranchNode,
  splitReports,
  type OrganizationNode,
} from '@/src/lib/organizationTree';
import { LeaderNode } from '@/src/components/planta/LeaderNode';
import { CollaboratorTable } from '@/src/components/planta/CollaboratorTable';
import { PersonMark, UnitEmblem } from '@/src/components/planta/UnitEmblem';
import { unitEmblemAssets } from '@/src/lib/unitEmblem';
import { SecondInCommandBadges } from '@/src/components/planta/SecondInCommandBadges';

type CoordinatorNodeProps = {
  node: OrganizationNode;
  expandedIds: Set<string>;
  onToggle: (nodeKey: string) => void;
  onManage: (personId: string) => void;
  onAssign: (personId: string) => void;
  canMutate?: boolean;
  variant?: 'apex' | 'default';
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
  }) => {
    const person = node.person;
    const isApex = variant === 'apex';
    const expanded = !isApex && expandedIds.has(node.nodeKey);
    const { nested, collaborators } = splitReports(node);
    const canEdit = person.can_edit === true;
    const canExpand = !isApex && node.children.length > 0;
    const tone = schoolAccent({
      schoolId: person.school_id,
      schoolName: person.school,
      areaName: person.area,
      roleName: person.role_name,
      personName: person.name,
    });
    const reducedMotion = useReducedMotion();

    return (
      <article
        className={cn(
          'unit-card overflow-hidden rounded-2xl border',
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
            'unit-card-header flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:gap-4 sm:p-5',
            isApex && 'rounded-xl bg-orbit-surface m-3 mb-0',
            canExpand && 'cursor-pointer',
            node.isContextOnly && 'opacity-80'
          )}
          onClick={canExpand ? () => onToggle(node.nodeKey) : undefined}
          role={canExpand ? 'button' : undefined}
          aria-expanded={canExpand ? expanded : undefined}
        >
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl text-sm font-bold"
            style={
              unitEmblemAssets(person)
                ? { backgroundColor: '#fff' }
                : { backgroundColor: tone.soft, color: tone.accent }
            }
          >
            <PersonMark subject={person} fallback={personInitials(person.name)} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
              {displayCase(person.role_name) || 'Coordinador'}
            </p>
            <h3 className="font-display text-lg font-semibold tracking-tight text-orbit-text">
              {displayCase(person.name)}
            </h3>
            <SecondInCommandBadges person={person} />
            {node.assignmentLabel ? (
              <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-orbit-warning">
                {node.assignmentLabel}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-orbit-text-secondary">
              {displayCase(person.area) || 'Sin área'}
              {person.school ? (
                <>
                  {' · '}
                  <span
                    className="inline-flex items-center gap-1 font-semibold"
                    style={{ color: tone.accent }}
                  >
                    <span
                      className="inline-block h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: tone.accent }}
                    />
                    {displayCase(person.school)}
                  </span>
                </>
              ) : null}
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
            <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-orbit-text-secondary">
              <TeamSummary
                node={node}
                canAssign={canEdit && canMutate}
                onAssign={onAssign}
              />
              {person.status !== 'active' && (
                <span className="text-xs font-semibold text-orbit-muted">
                  Inactivo
                </span>
              )}
            </div>
          </div>
          <UnitEmblem subject={person} />
          <div
            className="flex shrink-0 items-center gap-2 self-end sm:self-start"
            onClick={(e) => e.stopPropagation()}
          >
            {!isApex && <FocusInWheelButton nodeKey={node.nodeKey} />}
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
            {canExpand && (
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

        <AnimatePresence initial={false}>
        {expanded && node.children.length > 0 && (
          <motion.div
            key="coordinator-team"
            initial={reducedMotion ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reducedMotion ? 0 : 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
          <div
            className={cn(
              'px-4 py-4 sm:px-6',
              isApex
                ? 'pt-3'
                : 'border-t border-orbit-border bg-orbit-bg-secondary/40'
            )}
          >
              <div className="relative space-y-3 pl-3 sm:pl-5">
                <div
                  className="absolute bottom-2 left-0 top-2 w-px bg-orbit-border"
                  aria-hidden
                />
                {nested.map((child) => {
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
                    />
                  </div>
                )}
              </div>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </article>
    );
  }
);

CoordinatorNode.displayName = 'CoordinatorNode';
