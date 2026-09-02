import React from 'react';
import { PencilSquareIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { OrganizationNode } from '@/src/lib/organizationTree';
import { schoolAccent, type SchoolAccent } from '@/src/lib/schoolAccent';

type CollaboratorTableProps = {
  nodes: OrganizationNode[];
  onManage: (personId: string) => void;
  className?: string;
  parentAccent?: SchoolAccent | null;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (personId: string) => void;
};

export const CollaboratorTable: React.FC<CollaboratorTableProps> = ({
  nodes,
  onManage,
  className,
  parentAccent = null,
  selectable = false,
  selectedIds,
  onToggleSelect,
}) => {
  if (nodes.length === 0) return null;

  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className="w-full min-w-0 text-left text-sm">
        <thead className="hidden md:table-header-group">
          <tr className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
            {selectable ? <th className="py-2 pr-2 font-bold w-8" /> : null}
            <th className="py-2 pr-3 font-bold">Persona</th>
            <th className="py-2 pr-3 font-bold">Identificación</th>
            <th className="hidden py-2 pr-3 font-bold xl:table-cell">
              Correo CUN
            </th>
            <th className="hidden py-2 pr-3 font-bold lg:table-cell">
              Programa
            </th>
            <th className="py-2 pr-3 font-bold">Rol</th>
            <th className="hidden py-2 pr-3 font-bold sm:table-cell">Estado</th>
            <th className="py-2 text-right font-bold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {nodes.map((node) => {
            const person = node.person;
            const canEdit = person.can_edit !== false;
            const isSelected = selectedIds?.has(person.id) === true;
            const tone = schoolAccent(
              {
                schoolId: person.school_id,
                schoolName: person.school,
                programName: person.program,
                areaName: person.area,
                roleName: person.role_name,
                personName: person.name,
              },
              parentAccent
            );
            return (
              <tr
                key={node.nodeKey}
                className={cn(
                  'border-t border-orbit-border/80 align-top',
                  isSelected && 'bg-orbit-primary/5'
                )}
              >
                {selectable ? (
                  <td className="py-2.5 pr-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect?.(person.id)}
                      className="rounded border-orbit-border text-orbit-primary focus:ring-violet-400"
                      aria-label={`Seleccionar ${person.name}`}
                    />
                  </td>
                ) : null}
                <td className="py-2.5 pr-3">
                  <p className="font-semibold text-orbit-text truncate max-w-[16rem]">
                    {person.name || '—'}
                  </p>
                  {person.school ? (
                    <p
                      className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold truncate max-w-[16rem]"
                      style={{ color: tone.accent }}
                    >
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: tone.accent }}
                      />
                      {person.school}
                    </p>
                  ) : null}
                  {person.edu_email?.trim() ? null : (
                    <p className="mt-0.5 text-xs font-semibold text-orbit-danger xl:hidden">
                      Sin correo CUN
                    </p>
                  )}
                  <p className="text-xs text-orbit-muted truncate max-w-[16rem] md:hidden">
                    {person.document || 'Sin identificación'}
                  </p>
                </td>
                <td className="hidden py-2.5 pr-3 text-orbit-text-secondary md:table-cell">
                  {person.document || '—'}
                </td>
                <td className="hidden py-2.5 pr-3 xl:table-cell">
                  {person.edu_email?.trim() ? (
                    <span className="block max-w-[14rem] truncate text-orbit-text-secondary">
                      {person.edu_email}
                    </span>
                  ) : (
                    <span className="text-xs font-semibold text-orbit-danger">
                      Sin correo CUN
                    </span>
                  )}
                </td>
                <td className="hidden py-2.5 pr-3 text-orbit-text-secondary lg:table-cell">
                  {person.program || '—'}
                </td>
                <td className="py-2.5 pr-3">
                  <span className="inline-flex max-w-full truncate px-2 py-0.5 rounded-md bg-orbit-interactive text-[11px] font-semibold text-orbit-text-secondary">
                    {person.role_name || 'Sin rol'}
                  </span>
                </td>
                <td className="hidden py-2.5 pr-3 sm:table-cell">
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
                </td>
                <td className="py-2.5 text-right">
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
    </div>
  );
};
