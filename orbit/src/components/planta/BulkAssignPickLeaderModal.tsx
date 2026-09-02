import React, { useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { PlantaPerson } from '@/src/types';
import { canHaveDirectReports, personInitials } from '@/src/lib/roleHierarchy';
import { PLANTA_SELECT_CLASS } from '@/src/lib/plantaMappers';

type BulkAssignPickLeaderModalProps = {
  open: boolean;
  selectedPeople: PlantaPerson[];
  candidates: PlantaPerson[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (manager: PlantaPerson) => Promise<void>;
};

export const BulkAssignPickLeaderModal: React.FC<
  BulkAssignPickLeaderModalProps
> = ({
  open,
  selectedPeople,
  candidates,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(null);

  const selectedIds = useMemo(
    () => new Set(selectedPeople.map((p) => p.id)),
    [selectedPeople]
  );

  const leaders = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates
      .filter((p) => !selectedIds.has(p.id))
      .filter((p) =>
        canHaveDirectReports({
          roleName: p.role_name,
          roleCode: p.role_code,
        })
      )
      .filter((p) => {
        if (!q) return true;
        const hay = [p.name, p.email, p.edu_email, p.document, p.role_name]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 50);
  }, [candidates, query, selectedIds]);

  const picked = leaders.find((p) => p.id === pickedId) ?? null;

  if (!open) return null;

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
        aria-labelledby="bulk-pick-leader-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              id="bulk-pick-leader-title"
              className="text-lg font-display font-bold text-orbit-text"
            >
              Elegir responsable
            </h2>
            <p className="text-sm text-orbit-muted mt-1">
              {selectedPeople.length.toLocaleString('es-CO')} persona
              {selectedPeople.length === 1 ? '' : 's'} se asignarán al mismo
              líder de una vez.
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

        <div className="rounded-xl border border-orbit-border bg-orbit-bg-secondary/40 px-3 py-2 max-h-28 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted mb-1">
            Seleccionadas
          </p>
          <ul className="space-y-0.5">
            {selectedPeople.slice(0, 20).map((p) => (
              <li key={p.id} className="text-xs text-orbit-text-secondary truncate">
                {p.name}
                {p.document ? ` · ${p.document}` : ''}
              </li>
            ))}
            {selectedPeople.length > 20 && (
              <li className="text-xs text-orbit-muted">
                …y {(selectedPeople.length - 20).toLocaleString('es-CO')} más
              </li>
            )}
          </ul>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar líder / coordinador por nombre o cédula"
          className={PLANTA_SELECT_CLASS}
          disabled={loading}
        />

        <ul className="max-h-56 overflow-y-auto divide-y divide-orbit-border rounded-xl border border-orbit-border">
          {leaders.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-orbit-muted">
              No hay líderes que coincidan.
            </li>
          )}
          {leaders.map((person) => (
            <li key={person.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-orbit-interactive/50">
                <input
                  type="radio"
                  name="bulk-leader"
                  checked={pickedId === person.id}
                  onChange={() => setPickedId(person.id)}
                  disabled={loading}
                  className="mt-1 border-orbit-border text-orbit-primary focus:ring-violet-400"
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
                    {person.school ? ` · ${person.school}` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        <div className="flex justify-end gap-2 pt-1">
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
            disabled={loading || !picked}
            onClick={() => picked && void onConfirm(picked)}
            className={cn(
              'glass-button-primary px-4 py-2 text-sm font-bold disabled:opacity-50'
            )}
          >
            {loading
              ? 'Asignando…'
              : `Asignar ${selectedPeople.length} a ${picked?.name ?? '…'}`}
          </button>
        </div>
      </div>
    </div>
  );
};
