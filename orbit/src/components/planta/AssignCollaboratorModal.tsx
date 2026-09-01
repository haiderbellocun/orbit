import React, { useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { PlantaPerson } from '@/src/types';
import { collectDescendantIds, orgParentIdsOf } from '@/src/lib/organizationTree';
import type { OrgChartGraphPayload } from '@/src/types';
import { personInitials } from '@/src/lib/roleHierarchy';
import { PLANTA_SELECT_CLASS } from '@/src/lib/plantaMappers';

type AssignCollaboratorModalProps = {
  open: boolean;
  manager: PlantaPerson;
  people: PlantaPerson[];
  graph: OrgChartGraphPayload | null;
  loading?: boolean;
  onClose: () => void;
  onAssign: (personIds: string[]) => Promise<void>;
};

export const AssignCollaboratorModal: React.FC<
  AssignCollaboratorModalProps
> = ({ open, manager, people, graph, loading = false, onClose, onAssign }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);

  const blockedIds = useMemo(() => {
    const ids = collectDescendantIds(people, manager.id, graph);
    ids.add(manager.id);
    return ids;
  }, [people, manager.id, graph]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => !blockedIds.has(p.id))
      .filter((p) => {
        if (!q) return true;
        const hay = [p.name, p.email, p.edu_email, p.document]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [people, blockedIds, query]);

  const selectedPeople = useMemo(
    () => people.filter((p) => selected.has(p.id)),
    [people, selected]
  );
  const reassignCount = selectedPeople.filter((p) => {
    const parents = orgParentIdsOf(p.id, graph);
    return parents.length > 0 && !parents.includes(Number(manager.id));
  }).length;

  if (!open) return null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAssign = async () => {
    if (selected.size === 0 || loading) return;
    if (reassignCount > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    await onAssign([...selected]);
    setSelected(new Set());
    setConfirming(false);
    setQuery('');
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label="Cerrar"
        disabled={loading}
        onClick={onClose}
      />
      <div
        className="relative glass-panel w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="assign-collab-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="assign-collab-title"
              className="text-lg font-display font-bold text-orbit-text"
            >
              Asignar colaborador
            </h2>
            <p className="text-sm text-orbit-muted mt-1">
              A {manager.name}
              {manager.role_name ? ` · ${manager.role_name}` : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1 rounded-lg text-orbit-muted hover:text-orbit-text"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre, correo o identificación"
          className={PLANTA_SELECT_CLASS}
          disabled={loading}
        />

        <ul className="max-h-64 overflow-y-auto divide-y divide-orbit-border rounded-xl border border-orbit-border">
          {results.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-orbit-muted">
              No hay personas para asignar con esa búsqueda.
            </li>
          )}
          {results.map((person) => (
            <li key={person.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-orbit-interactive/50">
                <input
                  type="checkbox"
                  checked={selected.has(person.id)}
                  onChange={() => toggle(person.id)}
                  disabled={loading}
                  className="mt-1 rounded border-orbit-border text-orbit-primary focus:ring-violet-400"
                />
                <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-orbit-interactive text-orbit-text-secondary flex items-center justify-center text-[11px] font-bold">
                  {personInitials(person.name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-sm text-orbit-text truncate">
                    {person.name}
                  </span>
                  <span className="block text-xs text-orbit-muted truncate">
                    {person.role_name || 'Sin rol'}
                    {person.area ? ` · ${person.area}` : ''}
                  </span>
                  {orgParentIdsOf(person.id, graph).some(
                    (id) => id !== Number(manager.id)
                  ) && (
                      <span className="block text-xs text-orbit-warning">
                        Ya tiene responsable
                        {person.manager_name ? `: ${person.manager_name}` : ''}
                      </span>
                    )}
                </span>
              </label>
            </li>
          ))}
        </ul>

        {confirming && reassignCount > 0 && (
          <p className="text-sm text-orbit-warning">
            {reassignCount} persona{reassignCount === 1 ? '' : 's'} ya tiene
            responsable. Al confirmar se reasignará{reassignCount === 1 ? '' : 'n'} a{' '}
            {manager.name}.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-orbit-muted">
            Responsable: {manager.name} · {selected.size} seleccionada
            {selected.size === 1 ? '' : 's'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="glass-button-secondary px-4 py-2 text-sm font-bold"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading || selected.size === 0}
              onClick={() => void handleAssign()}
              className={cn(
                'glass-button-primary px-4 py-2 text-sm font-bold disabled:opacity-50'
              )}
            >
              {loading ? 'Asignando…' : confirming ? 'Confirmar asignación' : 'Asignar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
