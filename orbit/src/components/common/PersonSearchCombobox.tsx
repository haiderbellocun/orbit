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

const PERSON_LIST_LIMIT = 50;

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
  const [options, setOptions] = useState<PersonPick[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);

  const displayValue = value
    ? value.document
      ? `${value.name} · ${value.document}`
      : value.name
    : query;

  const searchPeople = useCallback(async (term: string) => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getPersonal({
        page: 1,
        limit: PERSON_LIST_LIMIT,
        search: term.trim() || undefined,
      });
      const picks: PersonPick[] = [];
      for (const row of res.data as Record<string, unknown>[]) {
        const pick = mapPersonalRow(row);
        if (pick) picks.push(pick);
      }
      setOptions(picks);
      setHighlight(0);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'No se pudo cargar el personal'
      );
      setOptions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => {
      void searchPeople(query);
    }, 250);
    return () => window.clearTimeout(t);
  }, [open, query, searchPeople]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const selectPerson = (person: PersonPick) => {
    onChange(person);
    setQuery('');
    setOpen(false);
  };

  const clear = () => {
    onChange(null);
    setQuery('');
    setOptions([]);
    inputRef.current?.focus();
  };

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          placeholder={placeholder}
          className={cn(
            'w-full rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary pl-10 pr-10 py-2.5 text-sm text-orbit-text shadow-sm focus:outline-none focus:ring-2 focus:ring-orbit-primary/30 disabled:opacity-50'
          )}
          value={displayValue}
          onChange={(e) => {
            if (value) onChange(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
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
                options.length === 0 ? 0 : Math.min(h + 1, options.length - 1)
              );
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter' && open && options[highlight]) {
              e.preventDefault();
              selectPerson(options[highlight]);
            }
          }}
        />
        {(value || query) && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-orbit-muted hover:text-orbit-text-secondary hover:bg-orbit-interactive"
            aria-label="Limpiar"
          >
            <XMarkIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto rounded-xl border border-orbit-border bg-orbit-elevated shadow-xl"
        >
          {loading && (
            <div className="px-3 py-3 text-sm text-orbit-muted">Buscando…</div>
          )}
          {!loading && loadError && (
            <div className="px-3 py-3 text-sm text-orbit-danger">{loadError}</div>
          )}
          {!loading && !loadError && options.length === 0 && (
            <div className="px-3 py-3 text-sm text-orbit-muted">
              Sin resultados
            </div>
          )}
          {!loading &&
            options.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={cn(
                  'w-full text-left px-3 py-2.5 text-sm hover:bg-orbit-interactive',
                  i === highlight && 'bg-orbit-primary/10'
                )}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => selectPerson(p)}
              >
                <div className="font-semibold text-orbit-text">{p.name}</div>
                <div className="text-xs text-orbit-muted">
                  {[p.document, p.role_name].filter(Boolean).join(' · ') || '—'}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
};
