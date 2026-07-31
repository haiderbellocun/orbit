import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronDownIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, Vacancy, Coordinator } from '@/src/types';
import {
  getAcademicLoad,
  getAcademicLoadFilterOptions,
  getCatalogAreas,
  getCatalogSchools,
  type CatalogArea,
  type CatalogSchool,
} from '@/src/lib/api';

interface AcademicLoadRow {
  id: string;
  teacherName: string;
  program: string;
  subjectName: string;
  subjectCode: string;
  groupCode: string;
  credits: string;
  modality: string;
  modalityLabel: string;
  block: string;
  period: string;
  type: string;
}

function mapRow(r: Record<string, unknown>): AcademicLoadRow {
  const modRaw = String(r.modality ?? '').trim();
  const modNorm = modRaw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  let mod = modRaw;
  if (/^P\b|^PRES/i.test(modNorm)) mod = 'P';
  else if (/^V\b|^VIR/i.test(modNorm)) mod = 'V';
  const modalityLabel =
    mod === 'P' ? 'Presencial' : mod === 'V' ? 'Virtual' : modRaw || '—';
  const creditsVal = r.credits;
  const credits =
    creditsVal != null && creditsVal !== ''
      ? String(creditsVal)
      : '—';
  const program =
    String(r.program ?? '') ||
    String(r.pensum_code ?? '') ||
    String(r.unit_code ?? '') ||
    '—';

  return {
    id: String(r.id ?? ''),
    teacherName: String(r.teacher_name ?? ''),
    program,
    subjectName: String(r.subject_name ?? ''),
    subjectCode: String(r.subject_code ?? ''),
    groupCode: String(r.group_code ?? ''),
    credits,
    modality: mod,
    modalityLabel,
    block: String(r.block ?? '') || '—',
    period: String(r.period ?? ''),
    type: String(r.type ?? 'projection'),
  };
}

type Filters = {
  search: string;
  period: string;
  modality: string;
  areaId: string;
  schoolId: string;
  program: string;
  subject: string;
  groupCode: string;
  block: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  period: '',
  modality: '',
  areaId: '',
  schoolId: '',
  program: '',
  subject: '',
  groupCode: '',
  block: '',
};

interface AcademicLoadViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

export const AcademicLoadView: React.FC<AcademicLoadViewProps> = ({
  onOpenVacancyFromNotification,
}) => {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [periodOptions, setPeriodOptions] = useState<string[]>([]);
  const [blockOptions, setBlockOptions] = useState<string[]>([]);
  const [programOptions, setProgramOptions] = useState<string[]>([]);
  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [rows, setRows] = useState<AcademicLoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);

  const selectClass =
    'w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [opts, a, s] = await Promise.all([
          getAcademicLoadFilterOptions(),
          getCatalogAreas(),
          getCatalogSchools(),
        ]);
        if (cancelled) return;
        setPeriodOptions(opts.periods);
        setBlockOptions(opts.blocks);
        setProgramOptions(opts.programs);
        setAreas(Array.isArray(a) ? a : []);
        setSchools(Array.isArray(s) ? s : []);
      } catch {
        /* catálogos opcionales */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const schoolOptions = useMemo(() => {
    if (!filters.areaId) return schools;
    return schools.filter((s) => String(s.area_id ?? '') === filters.areaId);
  }, [schools, filters.areaId]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAcademicLoad({
        unit_name: applied.search.trim() || undefined,
        period: applied.period || undefined,
        modality: applied.modality || undefined,
        area_id: applied.areaId ? Number(applied.areaId) : undefined,
        school_id: applied.schoolId ? Number(applied.schoolId) : undefined,
        program: applied.program || undefined,
        subject: applied.subject.trim() || undefined,
        group_code: applied.groupCode.trim() || undefined,
        block: applied.block || undefined,
        page: currentPage,
        limit: 100,
      });
      const list = Array.isArray(res.data)
        ? res.data.map((r) => mapRow(r as Record<string, unknown>))
        : [];
      setRows(list);
      setTotalCount(res.pagination?.total ?? 0);
      setTotalPages(res.pagination?.totalPages ?? 0);
    } catch {
      setRows([]);
      setTotalCount(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [applied, currentPage]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (filters.search === applied.search) return;
    const t = setTimeout(() => {
      setCurrentPage(1);
      setApplied((prev) => ({ ...prev, search: filters.search }));
    }, 300);
    return () => clearTimeout(t);
  }, [filters.search, applied.search]);

  const applyFilters = () => {
    setCurrentPage(1);
    setApplied({ ...filters });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setCurrentPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.period) n++;
    if (applied.modality) n++;
    if (applied.areaId) n++;
    if (applied.schoolId) n++;
    if (applied.program) n++;
    if (applied.subject.trim()) n++;
    if (applied.groupCode.trim()) n++;
    if (applied.block) n++;
    return n;
  }, [applied]);

  const hasActive =
    Boolean(applied.search.trim()) || activeFilterCount > 0;

  return (
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Carga Académica"
        subtitle="Asignación docente por periodo"
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      <div className="glass-panel p-4 space-y-3 relative z-10">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por docente, email, documento, materia o programa…"
              className={cn(selectClass, 'pl-10')}
              value={filters.search}
              onChange={(e) =>
                setFilters((f) => ({ ...f, search: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyFilters();
              }}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className={cn(
                'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors',
                filtersOpen || activeFilterCount > 0
                  ? 'bg-violet-50 border-violet-200 text-violet-700'
                  : 'bg-white/80 border-slate-200/80 text-slate-600 hover:bg-slate-50'
              )}
              aria-expanded={filtersOpen}
            >
              <FunnelIcon className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-md bg-violet-600 text-white text-[10px] flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
              <ChevronDownIcon
                className={cn(
                  'h-4 w-4 transition-transform',
                  filtersOpen && 'rotate-180'
                )}
              />
            </button>
            <button
              type="button"
              onClick={applyFilters}
              className="glass-button-primary px-4 py-2.5 text-sm font-bold"
            >
              Buscar
            </button>
            {hasActive && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50/60 transition-colors"
                title="Limpiar filtros"
              >
                <XMarkIcon className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        <AnimatePresence initial={false}>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 border-t border-slate-100">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Periodo
                    </span>
                    <select
                      className={selectClass}
                      value={filters.period}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, period: e.target.value }))
                      }
                    >
                      <option value="">Todos los periodos</option>
                      {periodOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Modalidad
                    </span>
                    <select
                      className={selectClass}
                      value={filters.modality}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, modality: e.target.value }))
                      }
                    >
                      <option value="">Todas</option>
                      <option value="P">Presencial</option>
                      <option value="V">Virtual</option>
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Bloque
                    </span>
                    <select
                      className={selectClass}
                      value={filters.block}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, block: e.target.value }))
                      }
                    >
                      <option value="">Todos</option>
                      {blockOptions.map((b) => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Área
                    </span>
                    <select
                      className={selectClass}
                      value={filters.areaId}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          areaId: e.target.value,
                          schoolId: '',
                        }))
                      }
                    >
                      <option value="">Todas</option>
                      {areas.map((a) => (
                        <option key={a.id} value={String(a.id)}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Escuela
                    </span>
                    <select
                      className={selectClass}
                      value={filters.schoolId}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          schoolId: e.target.value,
                        }))
                      }
                    >
                      <option value="">
                        {filters.areaId ? 'Todas del área' : 'Todas'}
                      </option>
                      {schoolOptions.map((s) => (
                        <option key={s.id} value={String(s.id)}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Programa
                    </span>
                    <select
                      className={selectClass}
                      value={filters.program}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, program: e.target.value }))
                      }
                    >
                      <option value="">Todos</option>
                      {programOptions.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Materia / código
                    </span>
                    <input
                      type="text"
                      className={selectClass}
                      placeholder="Nombre o código…"
                      value={filters.subject}
                      onChange={(e) =>
                        setFilters((f) => ({ ...f, subject: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyFilters();
                      }}
                    />
                  </label>

                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Grupo
                    </span>
                    <input
                      type="text"
                      className={selectClass}
                      placeholder="Código de grupo…"
                      value={filters.groupCode}
                      onChange={(e) =>
                        setFilters((f) => ({
                          ...f,
                          groupCode: e.target.value,
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') applyFilters();
                      }}
                    />
                  </label>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center relative z-10">
          <p className="text-sm font-medium text-slate-600">
            Cargando carga académica...
          </p>
        </div>
      ) : rows.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-16 text-center relative z-10"
        >
          <p className="text-slate-600 font-medium">
            No se encontraron registros con los filtros actuales.
          </p>
        </motion.div>
      ) : (
        <>
          <div className="glass-panel overflow-x-auto relative z-10">
            <table className="w-full text-left text-sm min-w-[960px]">
              <thead>
                <tr className="border-b border-white/40 text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  <th className="py-4 px-4">Docente</th>
                  <th className="py-4 px-4">Programa</th>
                  <th className="py-4 px-4">Materia</th>
                  <th className="py-4 px-4 w-24">Grupo</th>
                  <th className="py-4 px-4 w-24">Créditos</th>
                  <th className="py-4 px-4">Modalidad</th>
                  <th className="py-4 px-4">Bloque</th>
                  <th className="py-4 px-4">Periodo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-white/20 hover:bg-white/30 transition-colors"
                  >
                    <td className="py-3 px-4 font-medium text-slate-900">
                      {r.teacherName || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.program}</td>
                    <td className="py-3 px-4 text-slate-600 max-w-[220px]">
                      <div className="truncate">{r.subjectName || '—'}</div>
                      {r.subjectCode ? (
                        <div className="text-[10px] text-slate-400 font-mono">
                          {r.subjectCode}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-xs">
                      {r.groupCode || '—'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 font-mono text-xs">
                      {r.credits}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {r.modalityLabel}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.block}</td>
                    <td className="py-3 px-4 text-slate-600">{r.period}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalCount > 0 && (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-8 relative z-10">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
              >
                Anterior
              </button>
              <p className="text-sm font-medium text-slate-600">
                Página {currentPage} de {Math.max(totalPages, 1)} ({totalCount}{' '}
                registros)
              </p>
              <button
                type="button"
                disabled={currentPage >= totalPages || totalPages < 1}
                onClick={() => setCurrentPage((p) => p + 1)}
                className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
              >
                Siguiente
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
