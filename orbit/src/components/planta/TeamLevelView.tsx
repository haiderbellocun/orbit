import React, { useEffect, useState } from 'react';

const STAFF_PAGE = 30;
import { ChevronRightIcon, PencilSquareIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { displayCase } from '@/src/lib/displayText';
import { personInitials } from '@/src/lib/roleHierarchy';
import { schoolAccent } from '@/src/lib/schoolAccent';
import { splitReports, type OrganizationNode } from '@/src/lib/organizationTree';
import { unitEmblemAssets } from '@/src/lib/unitEmblem';
import { PersonMark } from '@/src/components/planta/UnitEmblem';
import { TeamSummary } from '@/src/components/planta/TeamSummary';
import { CollaboratorTable } from '@/src/components/planta/CollaboratorTable';
import { SecondInCommandBadges } from '@/src/components/planta/SecondInCommandBadges';

type TeamLevelViewProps = {
  node: OrganizationNode;
  onManage: (personId: string) => void;
  onAssign: (personId: string) => void;
  /** Entra al equipo de un nodo (mueve la rueda y la lista). */
  onEnter: (nodeKey: string) => void;
  canMutate: boolean;
};

export function toneOf(node: OrganizationNode) {
  const p = node.person;
  return schoolAccent({
    schoolId: p.school_id,
    schoolName: p.school,
    areaName: p.area,
    roleName: p.role_name,
    personName: p.name,
  });
}

export function Mark({ node, size }: { node: OrganizationNode; size: 'sm' | 'md' }) {
  const tone = toneOf(node);
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden font-bold',
        size === 'md' ? 'h-10 w-10 rounded-xl text-sm' : 'h-9 w-9 rounded-lg text-xs'
      )}
      style={
        unitEmblemAssets(node.person)
          ? { backgroundColor: '#fff' }
          : { backgroundColor: tone.soft, color: tone.accent }
      }
    >
      <PersonMark subject={node.person} fallback={personInitials(node.person.name)} />
    </div>
  );
}

/** Tarjeta compacta de una persona sin equipo a cargo (colaborador). */
export function PersonCard({
  node,
  onManage,
}: {
  node: OrganizationNode;
  onManage: (personId: string) => void;
}) {
  const childTone = toneOf(node);
  const p = node.person;
  return (
    <div
      className="flex h-full items-start gap-2.5 rounded-xl border bg-orbit-surface p-2.5"
      style={{
        borderColor: childTone.border,
        borderLeftWidth: 3,
        borderLeftColor: childTone.accent,
      }}
    >
      <Mark node={node} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[10px] font-bold uppercase tracking-wider text-orbit-muted">
          {displayCase(p.role_name) || 'Sin cargo'}
        </p>
        <p className="truncate text-sm font-semibold text-orbit-text">
          {displayCase(p.name)}
          {p.status !== 'active' && (
            <span className="ml-2 text-[11px] font-semibold text-orbit-muted">Inactivo</span>
          )}
        </p>
        <SecondInCommandBadges person={p} />
        <p className="truncate text-xs text-orbit-muted" title={p.edu_email || undefined}>
          {p.edu_email?.trim() || (
            <span className="font-semibold text-orbit-danger">Sin correo CUN</span>
          )}
        </p>
        <p className="truncate text-[11px] text-orbit-muted">
          {p.document || 'Sin identificación'}
          {p.program ? ` · ${displayCase(p.program)}` : ''}
        </p>
      </div>
      {p.can_edit !== false && (
        <button
          type="button"
          onClick={() => onManage(p.id)}
          className="shrink-0 rounded-lg p-1.5 text-orbit-primary hover:bg-orbit-primary/10"
          aria-label={`Gestionar a ${displayCase(p.name)}`}
          title="Gestionar"
        >
          <PencilSquareIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Lista de Planta Activa para el nivel que muestra la rueda: quien está en el
 * centro (una línea), su equipo en tarjetas compactas y sus colaboradores
 * directos en tabla. No anida niveles: para bajar se entra a una tarjeta, así
 * la lista se mantiene corta.
 */
export const TeamLevelView: React.FC<TeamLevelViewProps> = ({
  node,
  onManage,
  onAssign,
  onEnter,
  canMutate,
}) => {
  const person = node.person;
  const canEdit = person.can_edit === true;
  const { nested, collaborators } = splitReports(node);
  const tone = toneOf(node);
  const staff = collaborators.filter((child) => child.band !== 'faculty');
  const faculty = collaborators.filter((child) => child.band === 'faculty');
  const [staffShown, setStaffShown] = useState(STAFF_PAGE);
  useEffect(() => setStaffShown(STAFF_PAGE), [node.nodeKey]);

  return (
    <div className="space-y-4">
      {/* Quien está en el centro de la rueda */}
      <div
        className="flex items-center gap-3 rounded-xl border bg-orbit-surface px-3 py-2.5"
        style={{ borderColor: tone.border, borderLeftWidth: 4, borderLeftColor: tone.accent }}
      >
        <Mark node={node} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-orbit-text">
            {displayCase(person.name)}
            <span className="ml-2 text-xs font-normal text-orbit-muted">
              {displayCase(person.role_name)}
            </span>
            {person.status !== 'active' && (
              <span className="ml-2 text-[11px] font-semibold text-orbit-muted">Inactivo</span>
            )}
          </p>
          <p className="truncate text-xs text-orbit-muted">
            {person.edu_email?.trim() || (
              <span className="font-semibold text-orbit-danger">Sin correo CUN</span>
            )}
          </p>
          <SecondInCommandBadges person={person} />
          {node.children.length === 0 && (
            <TeamSummary
              node={node}
              canAssign={canEdit && canMutate}
              onAssign={onAssign}
              size="sm"
              className="mt-1"
            />
          )}
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => onManage(person.id)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold text-orbit-primary hover:bg-orbit-primary/10"
          >
            <PencilSquareIcon className="h-4 w-4" />
            Gestionar
          </button>
        ) : (
          <span className="shrink-0 text-xs text-orbit-muted">Solo lectura</span>
        )}
      </div>

      {nested.length > 0 && (
        <section>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
            Coordinaciones y líderes · {nested.length}
          </h4>
          {/* auto-rows-fr: todas las tarjetas miden lo mismo que la más alta. */}
          <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {nested.map((child) => {
              const childTone = toneOf(child);
              const childCanEdit = child.person.can_edit === true;
              const canEnter = child.children.length > 0;
              return (
                <div
                  key={child.nodeKey}
                  className={cn(
                    'group flex h-full min-h-[96px] items-start gap-2.5 rounded-xl border bg-orbit-surface p-2.5 transition-colors',
                    canEnter && 'cursor-pointer hover:bg-orbit-interactive/60'
                  )}
                  style={{
                    borderColor: childTone.border,
                    borderLeftWidth: 3,
                    borderLeftColor: childTone.accent,
                  }}
                  onClick={canEnter ? () => onEnter(child.nodeKey) : undefined}
                  role={canEnter ? 'button' : undefined}
                  tabIndex={canEnter ? 0 : undefined}
                  onKeyDown={
                    canEnter
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onEnter(child.nodeKey);
                          }
                        }
                      : undefined
                  }
                  title={canEnter ? 'Ver su equipo' : undefined}
                >
                  <Mark node={child} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[10px] font-bold uppercase tracking-wider text-orbit-muted">
                      {displayCase(child.person.role_name) || 'Sin cargo'}
                    </p>
                    <p className="truncate text-sm font-semibold text-orbit-text">
                      {displayCase(child.person.name)}
                    </p>
                    <SecondInCommandBadges person={child.person} />
                    <TeamSummary
                      node={child}
                      canAssign={childCanEdit && canMutate}
                      onAssign={onAssign}
                      size="sm"
                      className="mt-0.5"
                    />
                  </div>
                  <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                    {childCanEdit && (
                      <button
                        type="button"
                        onClick={() => onManage(child.person.id)}
                        className="rounded-lg p-1.5 text-orbit-primary hover:bg-orbit-primary/10"
                        aria-label={`Gestionar a ${displayCase(child.person.name)}`}
                        title="Gestionar"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </button>
                    )}
                    {canEnter && (
                      <button
                        type="button"
                        onClick={() => onEnter(child.nodeKey)}
                        className="rounded-lg p-1.5 text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text"
                        aria-label={`Ver el equipo de ${displayCase(child.person.name)}`}
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {staff.length > 0 && (
        <section>
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
            Colaboradores directos · {staff.length.toLocaleString('es-CO')}
          </h4>
          <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 2xl:grid-cols-3">
            {staff.slice(0, staffShown).map((child) => (
              <PersonCard key={child.nodeKey} node={child} onManage={onManage} />
            ))}
          </div>
          {staff.length > staffShown && (
            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setStaffShown((n) => n + STAFF_PAGE)}
                className="text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
              >
                Mostrar {Math.min(STAFF_PAGE, staff.length - staffShown)} más ·{' '}
                {(staff.length - staffShown).toLocaleString('es-CO')} restantes
              </button>
            </div>
          )}
        </section>
      )}

      {/* Los docentes suelen ser muchos: van en lista compacta. */}
      {faculty.length > 0 && (
        <section>
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
            Docentes · {faculty.length.toLocaleString('es-CO')}
          </h4>
          <CollaboratorTable nodes={faculty} onManage={onManage} />
        </section>
      )}
    </div>
  );
};
