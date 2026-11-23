import { displayCase } from '@/src/lib/displayText';
import React, { useEffect, useState } from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { OrganizationNode } from '@/src/lib/organizationTree';
import { schoolAccent } from '@/src/lib/schoolAccent';
import { SecondInCommandBadges } from '@/src/components/planta/SecondInCommandBadges';

type CollaboratorTableProps = {
  nodes: OrganizationNode[];
  onManage: (personId: string) => void;
  className?: string;
};

const PAGE_SIZE = 40;

export const CollaboratorTable: React.FC<CollaboratorTableProps> = ({
  nodes,
  onManage,
  className,
}) => {
  const [shown, setShown] = useState(PAGE_SIZE);
  const signature = `${nodes.length}:${nodes[0]?.nodeKey ?? ''}:${nodes[nodes.length - 1]?.nodeKey ?? ''}`;
  useEffect(() => {
    setShown(PAGE_SIZE);
  }, [signature]);

  if (nodes.length === 0) return null;
  // Si nadie del grupo tiene programa, la columna solo mostraría "—".
  const showProgram = nodes.some((node) => node.person.program?.trim());
  const visibleNodes = nodes.length > PAGE_SIZE ? nodes.slice(0, shown) : nodes;
  const remaining = nodes.length - visibleNodes.length;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-0 text-left text-sm">
        <thead className="hidden md:table-header-group">
          <tr className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
            <th className="py-2 pr-3 font-bold">Persona</th>
            <th className="py-2 pr-3 font-bold">Identificación</th>
            {showProgram && (
              <th className="hidden py-2 pr-3 font-bold lg:table-cell">
                Programa
              </th>
            )}
            <th className="py-2 pr-3 font-bold">Rol</th>
            <th className="hidden py-2 pr-3 font-bold xl:table-cell">Correo CUN</th>
            <th className="py-2 text-right font-bold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {visibleNodes.map((node) => {
            const person = node.person;
            const canEdit = person.can_edit !== false;
            const tone = schoolAccent({
              schoolId: person.school_id,
              schoolName: person.school,
              areaName: person.area,
              roleName: person.role_name,
            });
            return (
              <tr
                key={node.nodeKey}
                className="border-t border-orbit-border/80 align-top"
              >
                <td className="py-2 pr-3">
                  <p className="font-semibold text-orbit-text truncate max-w-[16rem]">
                    {displayCase(person.name) || '—'}
                    {person.status !== 'active' && (
                      <span className="ml-2 text-[11px] font-semibold text-orbit-muted">
                        Inactivo
                      </span>
                    )}
                  </p>
                  <SecondInCommandBadges person={person} />
                  {person.school ? (
                    <p
                      className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold truncate max-w-[16rem]"
                      style={{ color: tone.accent }}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tone.accent }}
                      />
                      {displayCase(person.school)}
                    </p>
                  ) : null}
                  <p className="text-xs text-orbit-muted truncate max-w-[16rem] md:hidden">
                    {person.document || 'Sin identificación'}
                  </p>
                </td>
                <td className="hidden py-2 pr-3 text-orbit-text-secondary md:table-cell">
                  {person.document || '—'}
                </td>
                {showProgram && (
                  <td className="hidden py-2 pr-3 text-orbit-text-secondary lg:table-cell">
                    {displayCase(person.program) || '—'}
                  </td>
                )}
                <td className="py-2 pr-3">
                  <span className="inline-flex max-w-full truncate px-2 py-0.5 rounded-md bg-orbit-interactive text-[11px] font-semibold text-orbit-text-secondary">
                    {displayCase(person.role_name) || 'Sin rol'}
                  </span>
                </td>
                <td className="hidden max-w-[14rem] truncate py-2 pr-3 text-xs text-orbit-text-secondary xl:table-cell">
                  {person.edu_email?.trim() || (
                    <span className="font-semibold text-orbit-danger">Sin correo CUN</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => onManage(person.id)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
                    >
                      <PencilSquareIcon className="h-3.5 w-3.5" />
                      Gestionar
                    </button>
                  ) : (
                    <span className="text-xs text-orbit-muted">Solo lectura</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {remaining > 0 && (
        <div className="border-t border-orbit-border/80 py-2 text-center">
          <button
            type="button"
            onClick={() => setShown((count) => count + PAGE_SIZE)}
            className="text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
          >
            Mostrar {Math.min(PAGE_SIZE, remaining)} más · {remaining.toLocaleString('es-CO')} restantes
          </button>
        </div>
      )}
    </div>
  );
};
