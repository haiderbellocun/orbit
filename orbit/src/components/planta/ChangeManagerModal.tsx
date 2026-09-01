import React, { useMemo, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { PlantaPerson } from '@/src/types';
import { canHaveDirectReports, personInitials } from '@/src/lib/roleHierarchy';
import { collectDescendantIds, orgParentIdsOf } from '@/src/lib/organizationTree';
import type { OrgChartGraphPayload } from '@/src/types';
import { PLANTA_SELECT_CLASS } from '@/src/lib/plantaMappers';

type ChangeManagerModalProps = {
  open: boolean;
  person: PlantaPerson;
  people: PlantaPerson[];
  graph: OrgChartGraphPayload | null;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (
    managerId: number | null,
    followOrganigrama?: boolean
  ) => Promise<void>;
};

const FOLLOW_ORG = '__org__';

export const ChangeManagerModal: React.FC<ChangeManagerModalProps> = ({
  open,
  person,
  people,
  graph,
  loading = false,
  onClose,
  onConfirm,
}) => {
  const plantaOv = (graph?.planta_overrides ?? []).find(
    (o) => o.person_id === Number(person.id)
  );
  const currentParentIds = orgParentIdsOf(person.id, graph);
  const currentParentId =
    currentParentIds[0] != null ? String(currentParentIds[0]) : null;
  const [query, setQuery] = useState('');
  const [pickedId, setPickedId] = useState<string | null>(() => {
    if (!plantaOv) return FOLLOW_ORG;
    return plantaOv.parent_person_id != null
      ? String(plantaOv.parent_person_id)
      : null;
  });

  const blockedIds = useMemo(() => {
    const ids = collectDescendantIds(people, person.id, graph);
    ids.add(person.id);
    return ids;
  }, [people, person.id, graph]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people
      .filter((p) => !blockedIds.has(p.id))
      .filter((p) =>
        canHaveDirectReports({
          roleName: p.role_name,
          roleCode: p.role_code,
        })
      )
      .filter((p) => {
        if (!q) return true;
        const hay = [p.name, p.email, p.edu_email, p.document]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 40);
  }, [people, blockedIds, query]);

  const picked = people.find((p) => p.id === pickedId) ?? null;
  const currentName = person.manager_name?.trim() || 'Nadie';

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
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-display font-bold text-orbit-text">
              Cambiar responsable
            </h2>
            <p className="text-sm text-orbit-muted mt-1">{person.name}</p>
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

        <p className="text-sm text-orbit-text-secondary">
          Responsable actual:{' '}
          <strong className="text-orbit-text">{currentName}</strong>
        </p>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar coordinador o líder…"
          className={PLANTA_SELECT_CLASS}
          disabled={loading}
        />

        <ul className="max-h-56 overflow-y-auto divide-y divide-orbit-border rounded-xl border border-orbit-border">
          <li>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-orbit-interactive/50">
              <input
                type="radio"
                name="new-manager"
                checked={pickedId === FOLLOW_ORG}
                onChange={() => setPickedId(FOLLOW_ORG)}
                disabled={loading}
                className="border-orbit-border text-orbit-primary focus:ring-violet-400"
              />
              <span className="text-sm text-orbit-text">
                Posición del organigrama
              </span>
            </label>
          </li>
          <li>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-orbit-interactive/50">
              <input
                type="radio"
                name="new-manager"
                checked={pickedId == null}
                onChange={() => setPickedId(null)}
                disabled={loading}
                className="border-orbit-border text-orbit-primary focus:ring-violet-400"
              />
              <span className="text-sm text-orbit-text">Sin responsable</span>
            </label>
          </li>
          {candidates.map((candidate) => (
            <li key={candidate.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-orbit-interactive/50">
                <input
                  type="radio"
                  name="new-manager"
                  checked={pickedId === candidate.id}
                  onChange={() => setPickedId(candidate.id)}
                  disabled={loading}
                  className="mt-1 border-orbit-border text-orbit-primary focus:ring-violet-400"
                />
                <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-orbit-interactive text-orbit-text-secondary flex items-center justify-center text-[11px] font-bold">
                  {personInitials(candidate.name)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-orbit-text">
                    {candidate.name}
                  </span>
                  <span className="block text-xs text-orbit-muted">
                    {candidate.role_name || 'Sin rol'}
                    {candidate.school ? ` · ${candidate.school}` : ''}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {pickedId === FOLLOW_ORG && plantaOv && (
          <p className="text-sm text-orbit-text-secondary">
            Se quitará el ajuste de Planta Activa y volverá a verse como en el
            Organigrama. El Organigrama no se modifica.
          </p>
        )}
        {picked && currentParentId != null && picked.id !== currentParentId && (
          <p className="text-sm text-orbit-text-secondary">
            Esta persona dejará de estar asignada a {currentName} y pasará a
            estar asignada a {picked.name}. El Organigrama no se modifica.
          </p>
        )}

        <div className="flex justify-end gap-2">
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
            disabled={loading}
            onClick={() => {
              if (pickedId === FOLLOW_ORG) {
                void onConfirm(null, true);
                return;
              }
              void onConfirm(pickedId != null ? Number(pickedId) : null, false);
            }}
            className={cn(
              'glass-button-primary px-4 py-2 text-sm font-bold disabled:opacity-50'
            )}
          >
            {loading ? 'Guardando…' : 'Confirmar cambio'}
          </button>
        </div>
      </div>
    </div>
  );
};
