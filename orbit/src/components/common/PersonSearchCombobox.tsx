import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { getPersonal } from '@/src/lib/api';

export type PersonPick = {
  id: number;
  name: string;
  document?: string;
  role_name?: string;
};

type PersonSearchComboboxProps = {
  value: PersonPick | null;
  onChange: (person: PersonPick | null) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

const PERSON_LIST_LIMIT = 200;

function mapPersonalRow(row: Record<string, unknown>): PersonPick | null {
  const id = Number(row.id);
  if (!Number.isFinite(id)) return null;
  const name = String(row.name ?? row.full_name ?? '').trim();
  if (!name) return null;
  const document =
    row.document != null && String(row.document).trim() !== ''
      ? String(row.document).trim()
      : undefined;
  const role_name =
    row.role_name != null && String(row.role_name).trim() !== ''
      ? String(row.role_name).trim()
      : undefined;
  return { id, name, document, role_name };
}

function filterPeople(all: PersonPick[], query: string): PersonPick[] {
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter((p) => {
    const name = p.name.toLowerCase();
    const doc = (p.document ?? '').toLowerCase();
    const role = (p.role_name ?? '').toLowerCase();
    return name.includes(q) || doc.includes(q) || role.includes(q);
  });
}

export const PersonSearchCombobox: React.FC<PersonSearchComboboxProps> = ({
  value,
  onChange,
  placeholder = 'Escriba nombre o documento para buscar…',
  className,
  disabled = false,
}) => {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [allPeople, setAllPeople] = useState<PersonPick[]>([]);
  const [options, setOptions] = useState<PersonPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const displayValue = value
    ? value.document
      ? `${value.name} · ${value.document}`
      : value.name
    : query;

  const loadAllPeople = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getPersonal({ page: 1, limit: PERSON_LIST_LIMIT });
      const picks: PersonPick[] = [];
      for (const row of res.data as Record<string, unknown>[]) {
        const pick = mapPersonalRow(row);
        if (pick) picks.push(pick);
      }
      setAllPeople(picks);
      setLoaded(true);
      return picks;
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'No se pudo cargar el personal de su escuela';
      setLoadError(msg);
      setAllPeople([]);
      setLoaded(false);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  const applyFilter = useCallback(
    (term: string, source?: PersonPick[]) => {
      const base = source ?? allPeople;
      setOptions(filterPeople(base, term));
      setHighlight(0);
    },
    [allPeople]
  );

  useEffect(() => {
    if (!open) return;
    if (!loaded) {
      void loadAllPeople().then((list) => applyFilter(query, list));
      return;
    }
    applyFilter(query);
  }, [open, query, loaded, loadAllPeople, applyFilter]);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const selectPerson = (p: PersonPick) => {
    onChange(p);
    setQuery('');
    setOpen(false);
    applyFilter('');
  };

  const clearSelection = () => {
    onChange(null);
    setQuery('');
    setOpen(true);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    if (loaded) applyFilter('');
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          placeholder={placeholder}
          value={displayValue}
          className={cn(
            'w-full rounded-xl border border-slate-100 bg-slate-50 py-2 pl-9 pr-9 text-sm transition-all',
            'focus:border-violet-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-500/20',
            disabled && 'cursor-not-allowed opacity-60'
          )}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
            if (value) {
              onChange(null);
              setQuery(value.name);
            }
          }}
          onChange={(e) => {
            if (disabled) return;
            if (value) onChange(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
              setOpen(true);
              return;
            }
            if (e.key === 'Escape') {
              setOpen(false);
              return;
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setHighlight((h) =>
                options.length === 0 ? 0 : (h + 1) % options.length
              );
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) =>
                options.length === 0
                  ? 0
                  : (h - 1 + options.length) % options.length
              );
            }
            if (e.key === 'Enter' && open && options[highlight]) {
              e.preventDefault();
              selectPerson(options[highlight]);
            }
          }}
        />
        {value ? (
          <button
            type="button"
            aria-label="Quitar persona seleccionada"
            disabled={disabled}
            onClick={clearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {loadError && !loading ? (
        <p className="mt-1 text-xs text-red-600">{loadError}</p>
      ) : null}

      {open && !disabled ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-30 mt-1 max-h-52 w-full overflow-auto rounded-xl border border-slate-100 bg-white py-1 text-sm shadow-lg"
        >
          {loading ? (
            <li className="px-3 py-2 text-slate-500">Cargando personal…</li>
          ) : loadError ? (
            <li className="px-3 py-2 text-red-600 text-xs">{loadError}</li>
          ) : options.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">
              {allPeople.length === 0
                ? 'No hay personal registrado en su escuela'
                : 'Sin coincidencias. Pruebe con otro nombre o documento.'}
            </li>
          ) : (
            options.map((p, i) => (
              <li key={p.id} role="option" aria-selected={value?.id === p.id}>
                <button
                  type="button"
                  className={cn(
                    'w-full px-3 py-2.5 text-left transition-colors',
                    i === highlight
                      ? 'bg-violet-50 text-violet-900'
                      : 'hover:bg-violet-50/80'
                  )}
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => selectPerson(p)}
                >
                  <span className="block font-medium text-slate-900">
                    {p.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {[p.document, p.role_name].filter(Boolean).join(' · ')}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {loaded && allPeople.length > 0 && !loading ? (
        <p className="mt-1 text-[10px] text-slate-400">
          {allPeople.length} persona{allPeople.length === 1 ? '' : 's'} en su
          escuela · escriba para filtrar
        </p>
      ) : null}
    </div>
  );
};
