import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRightIcon, PencilSquareIcon } from '@heroicons/react/24/solid';
import { ViewfinderCircleIcon } from '@heroicons/react/24/outline';
import type { PlantaPerson } from '@/src/types';
import { cn } from '@/src/lib/utils';
import { displayCase } from '@/src/lib/displayText';
import { personInitials } from '@/src/lib/roleHierarchy';
import type { OrganizationForest, OrganizationNode } from '@/src/lib/organizationTree';
import { Mark, toneOf } from '@/src/components/planta/TeamLevelView';
import { TeamSummary } from '@/src/components/planta/TeamSummary';
import { SecondInCommandBadges } from '@/src/components/planta/SecondInCommandBadges';

type PlantaSearchResultsProps = {
  forest: OrganizationForest;
  matches: (person: PlantaPerson) => boolean;
  onManage: (personId: string) => void;
  onAssign: (personId: string) => void;
  /** Lleva la rueda (y la lista, al quitar la búsqueda) a ese nodo. */
  onFocus: (nodeKey: string) => void;
  canMutate: boolean;
};

type Hit = { node: OrganizationNode; chain: OrganizationNode[] };

const PAGE_SIZE = 60;

/**
 * Resultados de búsqueda de Planta Activa como lista plana ordenada por
 * jerarquía: primero los cargos más altos. Cada persona muestra su ruta de
 * responsables para entender dónde está sin abrir el árbol.
 */
export const PlantaSearchResults: React.FC<PlantaSearchResultsProps> = ({
  forest,
  matches,
  onManage,
  onAssign,
  onFocus,
  canMutate,
}) => {
  const { hits, loose } = useMemo(() => {
    const seen = new Map<string, Hit>();
    const walk = (node: OrganizationNode, chain: OrganizationNode[]) => {
      if (matches(node.person)) {
        const prev = seen.get(node.person.id);
        if (!prev || prev.chain.length > chain.length) {
          seen.set(node.person.id, { node, chain });
        }
      }
      const next = [...chain, node];
      for (const child of node.children) walk(child, next);
    };
    for (const area of forest.areas) {
      for (const school of area.schools) {
        for (const root of school.roots) walk(root, []);
      }
    }
    const collator = new Intl.Collator('es', { sensitivity: 'base' });
    const list = [...seen.values()].sort(
      (a, b) =>
        a.chain.length - b.chain.length ||
        a.node.hierarchyLevel - b.node.hierarchyLevel ||
        collator.compare(a.node.person.name, b.node.person.name)
    );
    const inTree = new Set(seen.keys());
    const looseList = forest.unassigned
      .filter((p) => !inTree.has(p.id) && matches(p))
      .sort((a, b) => collator.compare(a.name, b.name));
    return { hits: list, loose: looseList };
  }, [forest, matches]);

  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => setShown(PAGE_SIZE), [hits]);

  if (hits.length === 0 && loose.length === 0) {
    return (
      <p className="px-2 py-12 text-center text-sm text-orbit-muted">
        No hay personas que coincidan con la búsqueda o los filtros.
      </p>
    );
  }

  const visible = hits.slice(0, shown);
  let lastDepth = -1;

  return (
    <div className="space-y-1.5">
      <p className="px-1 pb-1 text-xs text-orbit-muted">
        {(hits.length + loose.length).toLocaleString('es-CO')}{' '}
        {hits.length + loose.length === 1 ? 'persona encontrada' : 'personas encontradas'},
        de mayor a menor jerarquía
      </p>
      {visible.map(({ node, chain }) => {
        const person = node.person;
        const tone = toneOf(node);
        const canEdit = person.can_edit === true;
        // Una línea suave separa cada escalón de la jerarquía, sin nombrarlo.
        const newTier = lastDepth !== -1 && chain.length !== lastDepth;
        lastDepth = chain.length;
        return (
          <React.Fragment key={node.nodeKey}>
            {newTier && <div className="mx-1 my-2 h-px bg-orbit-border" aria-hidden />}
            <div
              className="group flex cursor-pointer items-start gap-2.5 rounded-xl border bg-orbit-surface p-2.5 transition-colors hover:bg-orbit-interactive/60"
              style={{ borderColor: tone.border, borderLeftWidth: 3, borderLeftColor: tone.accent }}
              onClick={() => onFocus(node.nodeKey)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onFocus(node.nodeKey);
                }
              }}
              title="Ver en la rueda"
            >
              <Mark node={node} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-orbit-text">
                  {displayCase(person.name)}
                  <span className="ml-2 text-xs font-normal text-orbit-muted">
                    {displayCase(person.role_name)}
                  </span>
                </p>
                {chain.length > 0 && (
                  <p
                    className="flex min-w-0 items-center gap-0.5 truncate text-[11px] text-orbit-muted"
                    title={chain.map((n) => displayCase(n.person.name)).join(' › ')}
                  >
                    <span className="shrink-0">Reporta a:</span>
                    {chain.map((n, i) => (
                      <React.Fragment key={n.nodeKey}>
                        {i > 0 && <ChevronRightIcon className="h-3 w-3 shrink-0" aria-hidden />}
                        <span
                          className={cn(
                            'truncate',
                            i === chain.length - 1 && 'font-semibold text-orbit-text-secondary'
                          )}
                        >
                          {displayCase(n.person.name)}
                        </span>
                      </React.Fragment>
                    ))}
                  </p>
                )}
                <SecondInCommandBadges person={person} />
                {node.children.length > 0 && (
                  <TeamSummary
                    node={node}
                    canAssign={canEdit && canMutate}
                    onAssign={onAssign}
                    size="sm"
                    className="mt-0.5"
                  />
                )}
              </div>
              <div className="flex shrink-0 items-center" onClick={(e) => e.stopPropagation()}>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => onManage(person.id)}
                    className="rounded-lg p-1.5 text-orbit-primary hover:bg-orbit-primary/10"
                    aria-label={`Gestionar a ${displayCase(person.name)}`}
                    title="Gestionar"
                  >
                    <PencilSquareIcon className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onFocus(node.nodeKey)}
                  className="rounded-lg p-1.5 text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text"
                  aria-label={`Ver a ${displayCase(person.name)} en la rueda`}
                  title="Ver en la rueda"
                >
                  <ViewfinderCircleIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </React.Fragment>
        );
      })}
      {hits.length > shown && (
        <div className="py-2 text-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
            className="text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
          >
            Mostrar {Math.min(PAGE_SIZE, hits.length - shown)} más ·{' '}
            {(hits.length - shown).toLocaleString('es-CO')} restantes
          </button>
        </div>
      )}
      {loose.length > 0 && (
        <>
          <p className="px-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-orbit-warning">
            Sin responsable asignado · {loose.length.toLocaleString('es-CO')}
          </p>
          {loose.map((person) => (
            <div
              key={person.id}
              className="flex items-center gap-2.5 rounded-xl border border-orbit-border bg-orbit-surface p-2.5"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orbit-interactive text-xs font-bold text-orbit-muted">
                {personInitials(person.name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-orbit-text">
                  {displayCase(person.name)}
                  <span className="ml-2 text-xs font-normal text-orbit-muted">
                    {displayCase(person.role_name)}
                  </span>
                </p>
                <p className="truncate text-[11px] text-orbit-muted">
                  {displayCase(person.area) || 'Sin área'}
                </p>
              </div>
              {person.can_edit !== false && (
                <button
                  type="button"
                  onClick={() => onManage(person.id)}
                  className="rounded-lg p-1.5 text-orbit-primary hover:bg-orbit-primary/10"
                  aria-label={`Gestionar a ${displayCase(person.name)}`}
                  title="Gestionar"
                >
                  <PencilSquareIcon className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
};
