import React, { useEffect, useMemo, useState } from 'react';
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
  /** Prefill: p.ej. seleccionados desde «Sin responsable». */
  initialSelectedIds?: string[];
  onClose: () => void;
  onAssign: (personIds: string[]) => Promise<void>;
};

type PickMode = 'search' | 'paste';
type ScopeFilter = 'unassigned' | 'all';

function normalizeDoc(raw: string): string {
  return raw.replace(/[\s.\-]/g, '').toLowerCase();
}

function parsePastedTokens(raw: string): string[] {
  const parts = raw
    .split(/[\n,;\t]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const key = normalizeDoc(part);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(part.trim());
  }
  return out;
}

export const AssignCollaboratorModal: React.FC<
  AssignCollaboratorModalProps
> = ({
  open,
  manager,
  people,
  graph,
  loading = false,
  initialSelectedIds,
  onClose,
  onAssign,
}) => {
  const [mode, setMode] = useState<PickMode>('search');
  const [scope, setScope] = useState<ScopeFilter>('unassigned');
  const [query, setQuery] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [pasteReport, setPasteReport] = useState<{
    matched: number;
    missing: string[];
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    setMode('search');
    setScope('unassigned');
    setQuery('');
    setPasteText('');
    setConfirming(false);
    setPasteReport(null);
    setSelected(new Set(initialSelectedIds ?? []));
  }, [open, manager.id, initialSelectedIds]);

  const blockedIds = useMemo(() => {
    const ids = collectDescendantIds(people, manager.id, graph);
    ids.add(manager.id);
    return ids;
  }, [people, manager.id, graph]);

  const eligible = useMemo(
    () => people.filter((p) => !blockedIds.has(p.id)),
    [people, blockedIds]
  );

  const isUnassigned = (person: PlantaPerson) =>
    orgParentIdsOf(person.id, graph).length === 0;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return eligible
      .filter((p) => (scope === 'unassigned' ? isUnassigned(p) : true))
      .filter((p) => {
        if (!q) return true;
        const hay = [p.name, p.email, p.edu_email, p.document]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      })
      .slice(0, 80);
  }, [eligible, graph, query, scope]);

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
    setConfirming(false);
  };

  const selectVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of results) next.add(p.id);
      return next;
    });
    setConfirming(false);
  };

  const clearSelected = () => {
    setSelected(new Set());
    setConfirming(false);
    setPasteReport(null);
  };

  const applyPaste = () => {
    const tokens = parsePastedTokens(pasteText);
    if (tokens.length === 0) {
      setPasteReport({ matched: 0, missing: [] });
      return;
    }
    const byDoc = new Map<string, PlantaPerson>();
    for (const p of eligible) {
      const doc = normalizeDoc(p.document ?? '');
      if (doc) byDoc.set(doc, p);
    }
    const matchedIds: string[] = [];
    const missing: string[] = [];
    for (const token of tokens) {
      const hit = byDoc.get(normalizeDoc(token));
      if (hit) matchedIds.push(hit.id);
      else missing.push(token);
    }
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of matchedIds) next.add(id);
      return next;
    });
    setPasteReport({ matched: matchedIds.length, missing });
    setConfirming(false);
  };

  const handleAssign = async () => {
    if (selected.size === 0 || loading) return;
    if (reassignCount > 0 && !confirming) {
      setConfirming(true);
      return;
    }
    await onAssign([...selected]);
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
        className="relative glass-panel w-full max-w-xl max-h-[92vh] overflow-y-auto p-6 space-y-4"
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
              Asignar colaboradores
            </h2>
            <p className="text-sm text-orbit-muted mt-1">
              Cargue masivo hacia{' '}
              <strong className="text-orbit-text">{manager.name}</strong>
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

        <div className="flex flex-wrap gap-2">
          {(
            [
              ['search', 'Buscar y marcar'],
              ['paste', 'Pegar identificaciones'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              disabled={loading}
              onClick={() => setMode(id)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-xs font-bold',
                mode === id
                  ? 'bg-orbit-primary text-white'
                  : 'bg-orbit-interactive text-orbit-text-secondary hover:text-orbit-text'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'search' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['unassigned', 'Sin responsable'],
                  ['all', 'Toda la planta'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  disabled={loading}
                  onClick={() => setScope(id)}
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] font-bold',
                    scope === id
                      ? 'bg-orbit-warning/15 text-orbit-warning'
                      : 'bg-orbit-interactive text-orbit-muted'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, correo o identificación"
              className={PLANTA_SELECT_CLASS}
              disabled={loading}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-orbit-muted">
                Mostrando {results.length.toLocaleString('es-CO')}
                {scope === 'unassigned' ? ' sin responsable' : ''}
              </p>
              <button
                type="button"
                disabled={loading || results.length === 0}
                onClick={selectVisible}
                className="text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover disabled:opacity-40"
              >
                Marcar visibles
              </button>
            </div>
            <ul className="max-h-56 overflow-y-auto divide-y divide-orbit-border rounded-xl border border-orbit-border">
              {results.length === 0 && (
                <li className="px-4 py-8 text-center text-sm text-orbit-muted">
                  No hay personas para asignar con ese filtro.
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
                        {person.document || 'Sin ID'}
                        {person.role_name ? ` · ${person.role_name}` : ''}
                      </span>
                      {orgParentIdsOf(person.id, graph).some(
                        (id) => id !== Number(manager.id)
                      ) && (
                        <span className="block text-xs text-orbit-warning">
                          Ya tiene responsable
                          {person.manager_name
                            ? `: ${person.manager_name}`
                            : ''}
                        </span>
                      )}
                      {!person.edu_email?.trim() && (
                        <span className="block text-xs font-semibold text-orbit-danger">
                          Sin correo CUN
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-orbit-text-secondary">
              Pega cédulas o documentos (uno por línea, o separados por coma).
              Se resolverán contra la planta cargada y se agregarán a la
              selección.
            </p>
            <textarea
              value={pasteText}
              onChange={(e) => {
                setPasteText(e.target.value);
                setPasteReport(null);
              }}
              rows={8}
              disabled={loading}
              placeholder={'123456789\n987654321\n1122334455'}
              className={cn(PLANTA_SELECT_CLASS, 'font-mono text-xs')}
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={loading || !pasteText.trim()}
                onClick={applyPaste}
                className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                Resolver y agregar
              </button>
            </div>
            {pasteReport && (
              <div className="rounded-xl border border-orbit-border bg-orbit-bg-secondary/50 px-3 py-2 text-sm space-y-1">
                <p className="text-orbit-text">
                  {pasteReport.matched.toLocaleString('es-CO')} coincidencia
                  {pasteReport.matched === 1 ? '' : 's'} agregada
                  {pasteReport.matched === 1 ? '' : 's'}
                </p>
                {pasteReport.missing.length > 0 && (
                  <p className="text-xs text-orbit-warning">
                    Sin match ({pasteReport.missing.length}):{' '}
                    {pasteReport.missing.slice(0, 8).join(', ')}
                    {pasteReport.missing.length > 8 ? '…' : ''}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {selected.size > 0 && (
          <div className="rounded-xl border border-orbit-primary/20 bg-orbit-primary/5 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-orbit-text">
                {selected.size.toLocaleString('es-CO')} persona
                {selected.size === 1 ? '' : 's'} lista
                {selected.size === 1 ? '' : 's'} para{' '}
                {manager.name}
              </p>
              <button
                type="button"
                disabled={loading}
                onClick={clearSelected}
                className="text-xs font-bold text-orbit-muted hover:text-orbit-text"
              >
                Limpiar
              </button>
            </div>
            <ul className="mt-2 max-h-28 overflow-y-auto space-y-1">
              {selectedPeople.slice(0, 40).map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-2 text-xs text-orbit-text-secondary"
                >
                  <span className="truncate">
                    {p.name}
                    {p.document ? ` · ${p.document}` : ''}
                  </span>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => toggle(p.id)}
                    className="shrink-0 font-bold text-orbit-danger/80 hover:text-orbit-danger"
                  >
                    Quitar
                  </button>
                </li>
              ))}
              {selectedPeople.length > 40 && (
                <li className="text-xs text-orbit-muted">
                  …y {(selectedPeople.length - 40).toLocaleString('es-CO')} más
                </li>
              )}
            </ul>
          </div>
        )}

        {confirming && reassignCount > 0 && (
          <p className="text-sm text-orbit-warning">
            {reassignCount} persona{reassignCount === 1 ? '' : 's'} ya tiene
            responsable. Al confirmar se reasignará
            {reassignCount === 1 ? '' : 'n'} a {manager.name}.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          <p className="text-xs text-orbit-muted">
            Se asignan todas de una vez a {manager.name}
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
              {loading
                ? 'Asignando…'
                : confirming
                  ? 'Confirmar asignación'
                  : `Asignar ${selected.size || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
