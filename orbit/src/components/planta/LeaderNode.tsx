import React from 'react';
import {
  ChevronDownIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { personInitials } from '@/src/lib/roleHierarchy';
import { schoolAccent } from '@/src/lib/schoolAccent';
import {
  isBranchNode,
  splitReports,
  type OrganizationNode,
} from '@/src/lib/organizationTree';
import { CollaboratorTable } from '@/src/components/planta/CollaboratorTable';

type LeaderNodeProps = {
  node: OrganizationNode;
  expandedIds: Set<string>;
  onToggle: (nodeKey: string) => void;
  onManage: (personId: string) => void;
  onAssign: (personId: string) => void;
  depth?: number;
  canMutate?: boolean;
};

export const LeaderNode: React.FC<LeaderNodeProps> = React.memo(
  ({ node, expandedIds, onToggle, onManage, onAssign, depth = 1, canMutate = true }) => {
    const person = node.person;
    const expanded = expandedIds.has(node.nodeKey);
    const { nested, collaborators } = splitReports(node);
    const canExpand = true;
    const canEdit = person.can_edit === true;
    const tone = schoolAccent({
      schoolId: person.school_id,
      schoolName: person.school,
      areaName: person.area,
      roleName: person.role_name,
    });

    return (
      <div className="relative">
        <div
          className={cn(
            'rounded-xl border bg-orbit-surface',
            node.isContextOnly && 'opacity-80'
          )}
          style={{
            borderColor: tone.border,
            borderLeftWidth: 3,
            borderLeftColor: tone.accent,
          }}
        >
          <div
            className={cn(
              'flex items-start gap-3 p-3 sm:p-4',
              canExpand && 'cursor-pointer'
            )}
            onClick={() => {
              if (canExpand) onToggle(node.nodeKey);
            }}
            role={canExpand ? 'button' : undefined}
            aria-expanded={canExpand ? expanded : undefined}
          >
            <div
              className="mt-0.5 h-9 w-9 shrink-0 rounded-lg flex items-center justify-center text-xs font-bold"
              style={{ backgroundColor: tone.soft, color: tone.accent }}
            >
              {personInitials(person.name)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                {person.role_name || 'Líder'}
              </p>
              <p className="font-semibold text-orbit-text truncate">
                {person.name}
              </p>
              {node.assignmentLabel ? (
                <p className="text-[10px] font-bold uppercase tracking-widest text-orbit-warning">
                  {node.assignmentLabel}
                </p>
              ) : null}
              <p className="text-xs truncate">
                {person.program ? (
                  <span className="text-orbit-muted">{person.program}</span>
                ) : null}
                {person.school ? (
                  <span
                    className="inline-flex items-center gap-1 font-semibold"
                    style={{ color: tone.accent }}
                  >
                    {person.program ? ' · ' : null}
                    {person.school}
                  </span>
                ) : (
                  !person.program && (
                    <span className="text-orbit-muted">Sin programa</span>
                  )
                )}
              </p>
              <p className="mt-1 text-xs text-orbit-text-secondary">
                {node.totalReportsCount} colaborador
                {node.totalReportsCount === 1 ? '' : 'es'}
              </p>
            </div>
            <div
              className="flex shrink-0 items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {canEdit ? (
                <button
                  type="button"
                  onClick={() => onManage(person.id)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-orbit-primary hover:bg-orbit-primary/10"
                >
                  <PencilSquareIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Gestionar</span>
                </button>
              ) : null}
              {canExpand ? (
                <button
                  type="button"
                  onClick={() => onToggle(node.nodeKey)}
                  className="rounded-lg p-1.5 text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text"
                  aria-label={expanded ? 'Contraer' : 'Expandir'}
                >
                  <ChevronDownIcon
                    className={cn(
                      'h-4 w-4 transition-transform',
                      expanded && 'rotate-180'
                    )}
                  />
                </button>
              ) : (
                <span className="w-8" />
              )}
            </div>
          </div>

          {expanded && (
            <div className="border-t border-orbit-border px-3 pb-3 sm:px-4 sm:pb-4">
              {node.children.length === 0 ? (
                <div className="py-4 text-sm text-orbit-muted">
                  <p>Este líder aún no tiene colaboradores asignados.</p>
                  {canEdit && canMutate && (
                    <button
                      type="button"
                      onClick={() => onAssign(person.id)}
                      className="mt-2 text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
                    >
                      Asignar colaborador
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-3">
                  {nested.map((child) =>
                    isBranchNode(child) ? (
                      <LeaderNode
                        key={child.nodeKey}
                        node={child}
                        expandedIds={expandedIds}
                        onToggle={onToggle}
                        onManage={onManage}
                        onAssign={onAssign}
                        depth={depth + 1}
                        canMutate={canMutate}
                      />
                    ) : null
                  )}
                  <CollaboratorTable
                    nodes={collaborators}
                    onManage={onManage}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }
);

LeaderNode.displayName = 'LeaderNode';
