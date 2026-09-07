import { SecondInCommandBadges } from './SecondInCommandBadges';
import React from 'react';
import {
  ChevronDownIcon,
  PencilSquareIcon,
  UserPlusIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { personInitials } from '@/src/lib/roleHierarchy';
import { schoolAccent, type SchoolAccent } from '@/src/lib/schoolAccent';
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
  parentAccent?: SchoolAccent | null;
  siblingIndex?: number;
};

export const LeaderNode: React.FC<LeaderNodeProps> = React.memo(
  ({ node, expandedIds, onToggle, onManage, onAssign, depth = 1, canMutate = true, parentAccent = null, siblingIndex }) => {
    const person = node.person;
    const expanded = expandedIds.has(node.nodeKey);
    const { nested, collaborators } = splitReports(node);
    const canExpand = true;
    const canEdit = person.can_edit === true;
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
              <SecondInCommandBadges person={person} />
              {node.assignmentLabel ? (
                <p className="text-[10px] font-bold uppercase tracking-widest text-orbit-warning">
                  {node.assignmentLabel}
                </p>
              ) : null}
              <p className="text-xs truncate font-semibold" style={{ color: tone.accent }}>
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
              <p className="mt-1 text-xs text-orbit-text-secondary">
                {node.totalReportsCount} colaborador
                {node.totalReportsCount === 1 ? '' : 'es'}
              </p>
            </div>
            <div
              className="flex shrink-0 items-center gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {canEdit && canMutate ? (
                <button
                  type="button"
                  onClick={() => onAssign(person.id)}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-orbit-primary hover:bg-orbit-primary/10"
                  title="Asignar varios colaboradores de una vez"
                >
                  <UserPlusIcon className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Asignar</span>
                </button>
              ) : null}
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
                      Asignar colaboradores
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3 pt-3">
                  {nested.map((child, index) =>
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
                        parentAccent={tone}
                        siblingIndex={index}
                      />
                    ) : null
                  )}
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
      </div>
    );
  }
);

LeaderNode.displayName = 'LeaderNode';
