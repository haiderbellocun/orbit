import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MagnifyingGlassIcon,
  Squares2X2Icon,
  UsersIcon,
  BriefcaseIcon,
} from "@heroicons/react/24/outline";
import { cn } from "@/src/lib/utils";
import { View, type NavItem } from "@/src/types";
import { APP_ICONS } from "@/src/config/brand";
import { getPlantaActiva, getVacancies } from "@/src/lib/api";
import {
  hasCapability,
  ORBIT_CAPABILITY,
} from "@/src/lib/permissions";
import type { Vacancy as ApiVacancy } from "@/src/types";

type SearchPerson = {
  id: number | string;
  name: string;
  document?: string;
  areaName?: string | null;
  schoolName?: string | null;
};

type SearchResult =
  | { kind: "nav"; id: string; label: string; view: View; iconKey: string }
  | { kind: "person"; id: string; label: string; meta: string }
  | { kind: "vacancy"; id: string; label: string; meta: string; vacancyId: string };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  capabilities: string[];
  setView: (v: View) => void;
  onSelectVacancy?: (vacancyId: string) => void;
}

function normalizePerson(row: Record<string, unknown>): SearchPerson | null {
  const id = (row.id ?? row.person_id ?? row.personId) as number | string | undefined;
  const name = String(
    row.full_name ?? row.fullName ?? row.name ?? row.nombre ?? ""
  ).trim();
  if (id == null || !name) return null;
  return {
    id,
    name,
    document: String(row.document ?? row.documento ?? row.id_number ?? "").trim() || undefined,
    areaName: (row.area_name ?? row.areaName ?? null) as string | null,
    schoolName: (row.school_name ?? row.schoolName ?? null) as string | null,
  };
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  navItems,
  capabilities,
  setView,
  onSelectVacancy,
}) => {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [people, setPeople] = useState<SearchPerson[]>([]);
  const [vacancies, setVacancies] = useState<ApiVacancy[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const canPlanta = hasCapability(capabilities, ORBIT_CAPABILITY.PLANTA_ACTIVA);
  const canVacancies = hasCapability(capabilities, ORBIT_CAPABILITY.VACANCIES);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActiveIndex(0);
      setPeople([]);
      setVacancies([]);
      return;
    }
    const t = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setPeople([]);
      setVacancies([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const tasks: Promise<void>[] = [];

        if (canPlanta) {
          tasks.push(
            getPlantaActiva({ search: q, limit: 6, status: "active" })
              .then((res) => {
                if (cancelled) return;
                const rows = Array.isArray(res.data) ? res.data : [];
                setPeople(
                  rows
                    .map((r) => normalizePerson(r as Record<string, unknown>))
                    .filter((p): p is SearchPerson => p != null)
                    .slice(0, 6)
                );
              })
              .catch(() => {
                if (!cancelled) setPeople([]);
              })
          );
        }

        if (canVacancies) {
          tasks.push(
            getVacancies()
              .then((res) => {
                if (cancelled) return;
                const list = Array.isArray(res.data) ? res.data : [];
                const lower = q.toLowerCase();
                setVacancies(
                  list
                    .filter((v) => {
                      const hay = [
                        v.positionName,
                        v.programName,
                        v.areaName,
                        v.schoolName,
                        v.operationStatus,
                        v.id,
                      ]
                        .filter(Boolean)
                        .join(" ")
                        .toLowerCase();
                      return hay.includes(lower);
                    })
                    .slice(0, 6)
                );
              })
              .catch(() => {
                if (!cancelled) setVacancies([]);
              })
          );
        }

        await Promise.all(tasks);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open, canPlanta, canVacancies]);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    const navResults: SearchResult[] = navItems
      .filter((item) => !q || item.label.toLowerCase().includes(q))
      .map((item) => ({
        kind: "nav" as const,
        id: `nav-${item.id}`,
        label: item.label,
        view: item.id as View,
        iconKey: item.iconKey,
      }));

    const personResults: SearchResult[] = people.map((p) => ({
      kind: "person" as const,
      id: `person-${p.id}`,
      label: p.name,
      meta: [p.document, p.areaName || p.schoolName].filter(Boolean).join(" · "),
    }));

    const vacancyResults: SearchResult[] = vacancies.map((v) => ({
      kind: "vacancy" as const,
      id: `vac-${v.id}`,
      label: v.positionName || `Vacante ${v.id}`,
      meta: [v.programName, v.areaName, v.operationStatus].filter(Boolean).join(" · "),
      vacancyId: String(v.id),
    }));

    if (!q) return navResults;
    return [...navResults, ...personResults, ...vacancyResults];
  }, [query, navItems, people, vacancies]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results.length, query]);

  const runResult = useCallback(
    (item: SearchResult) => {
      if (item.kind === "nav") {
        setView(item.view);
      } else if (item.kind === "person") {
        setView("planta-activa");
      } else if (item.kind === "vacancy") {
        if (onSelectVacancy) onSelectVacancy(item.vacancyId);
        else setView("vacancies");
      }
      onClose();
    },
    [setView, onSelectVacancy, onClose]
  );

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && results[activeIndex]) {
        e.preventDefault();
        runResult(results[activeIndex]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, results, activeIndex, runResult]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Búsqueda rápida"
    >
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/40 dark:bg-black/65"
        aria-label="Cerrar búsqueda"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl overflow-hidden rounded-[14px] border border-orbit-border bg-orbit-elevated shadow-2xl shadow-slate-200/80 dark:shadow-black/40">
        <div className="flex items-center gap-3 border-b border-orbit-border px-4 py-3">
          <MagnifyingGlassIcon className="h-5 w-5 shrink-0 text-orbit-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar módulos, personas o vacantes…"
            className="flex-1 bg-transparent text-sm text-orbit-text placeholder:text-orbit-muted outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <span className="orbit-kbd">Esc</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-orbit-muted">
              {loading
                ? "Buscando…"
                : query.trim().length >= 2
                  ? "Sin resultados para esta búsqueda"
                  : "Escribe para filtrar módulos o buscar registros"}
            </p>
          ) : (
            <ul className="px-2">
              {results.map((item, idx) => {
                const isActive = idx === activeIndex;
                let Icon = Squares2X2Icon;
                if (item.kind === "nav") {
                  Icon =
                    (APP_ICONS[item.iconKey as keyof typeof APP_ICONS] as typeof Squares2X2Icon) ||
                    Squares2X2Icon;
                } else if (item.kind === "person") {
                  Icon = UsersIcon;
                } else {
                  Icon = BriefcaseIcon;
                }

                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      data-idx={idx}
                      onMouseEnter={() => setActiveIndex(idx)}
                      onClick={() => runResult(item)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors duration-150",
                        isActive
                          ? "bg-orbit-interactive text-orbit-text"
                          : "text-orbit-text-secondary hover:bg-orbit-interactive/60"
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orbit-border",
                          isActive ? "text-orbit-primary" : "text-orbit-muted"
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-orbit-text">
                          {item.label}
                        </span>
                        <span className="block truncate text-[11px] text-orbit-muted">
                          {item.kind === "nav"
                            ? "Módulo"
                            : item.kind === "person"
                              ? item.meta || "Planta activa"
                              : item.meta || "Vacante"}
                        </span>
                      </span>
                      <span className="orbit-label shrink-0 normal-case tracking-normal">
                        {item.kind === "nav"
                          ? "Ir"
                          : item.kind === "person"
                            ? "Persona"
                            : "Vacante"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-orbit-border px-4 py-2.5 text-[11px] text-orbit-muted">
          <span>
            <span className="orbit-kbd mr-1">↑</span>
            <span className="orbit-kbd mr-1">↓</span>
            navegar
          </span>
          <span>
            <span className="orbit-kbd mr-1">↵</span>
            abrir
          </span>
        </div>
      </div>
    </div>
  );
};
