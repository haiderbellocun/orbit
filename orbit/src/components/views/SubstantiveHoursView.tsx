import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronDownIcon,
  XMarkIcon,
  PlusIcon,
  TrashIcon,
  ClockIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { Vacancy, Teacher, Coordinator } from '@/src/types';
import {
  getSubstantiveHoursTeachers,
  getSubstantiveHoursCategories,
  createSubstantiveHoursAssignment,
  getCatalogAreas,
  getCatalogSchools,
  type SubstantiveHoursTeacher,
  type SubstantiveHoursCategory,
  type CatalogArea,
  type CatalogSchool,
} from '@/src/lib/api';

interface SubstantiveHoursViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

type Filters = {
  search: string;
  areaId: string;
  schoolId: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  areaId: '',
  schoolId: '',
};

const PLACEHOLDER_CATEGORY = 'PEDIR LISTA CATEGORIAS HORAS SUSTANTIVAS';

export const SubstantiveHoursView: React.FC<SubstantiveHoursViewProps> = ({
  onOpenVacancyFromNotification,
}) => {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rows, setRows] = useState<SubstantiveHoursTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);

  const [modalTeacher, setModalTeacher] =
    useState<SubstantiveHoursTeacher | null>(null);
  const [categories, setCategories] = useState<SubstantiveHoursCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [hoursInput, setHoursInput] = useState('');
  const [tasks, setTasks] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const selectClass =
    'w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, s] = await Promise.all([
          getCatalogAreas(),
          getCatalogSchools(),
        ]);
        if (cancelled) return;
        setAreas(Array.isArray(a) ? a : []);
        setSchools(Array.isArray(s) ? s : []);
      } catch {
        if (!cancelled) {
          setAreas([]);
          setSchools([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSubstantiveHoursTeachers({
        search: applied.search.trim() || undefined,
        area_id: applied.areaId ? Number(applied.areaId) : undefined,
        school_id: applied.schoolId ? Number(applied.schoolId) : undefined,
        page: currentPage,
        limit: 50,
      });
      setRows(Array.isArray(res.data) ? res.data : []);
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
    if (applied.areaId) n++;
    if (applied.schoolId) n++;
    return n;
  }, [applied]);

  const openAddModal = async (teacher: SubstantiveHoursTeacher) => {
    setModalTeacher(teacher);
    setHoursInput('');
    setTasks(['']);
    setFormError(null);
    setCategoryId('');
    try {
      const cats = await getSubstantiveHoursCategories();
      const list =
        Array.isArray(cats) && cats.length > 0
          ? cats
          : [{ id: null, name: PLACEHOLDER_CATEGORY }];
      setCategories(list);
      setCategoryId(list[0]?.id != null ? String(list[0].id) : '');
    } catch {
      setCategories([{ id: null, name: PLACEHOLDER_CATEGORY }]);
      setCategoryId('');
    }
  };

  const closeModal = () => {
    if (saving) return;
    setModalTeacher(null);
    setFormError(null);
  };

  const addTaskRow = () => setTasks((t) => [...t, '']);
  const removeTaskRow = (idx: number) =>
    setTasks((t) => (t.length <= 1 ? [''] : t.filter((_, i) => i !== idx)));
  const updateTask = (idx: number, value: string) =>
    setTasks((t) => t.map((x, i) => (i === idx ? value : x)));

  const onHoursChange = (raw: string) => {
    // Solo dígitos enteros (sin punto ni coma).
    const digits = raw.replace(/\D/g, '');
    setHoursInput(digits);
  };

  const submitAssignment = async () => {
    if (!modalTeacher) return;
    setFormError(null);
    if (!/^\d+$/.test(hoursInput) || Number(hoursInput) < 1) {
      setFormError('La cantidad de horas debe ser un entero mayor o igual a 1.');
      return;
    }
    const taskList = tasks.map((t) => t.trim()).filter(Boolean);
    setSaving(true);
    try {
      await createSubstantiveHoursAssignment({
        personId: Number(modalTeacher.id),
        categoryId: categoryId ? Number(categoryId) : null,
        hoursQuantity: Number.parseInt(hoursInput, 10),
        tasks: taskList,
      });
      setModalTeacher(null);
      await loadList();
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'No se pudo guardar la asignación'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Horas Sustantivas"
        subtitle="Asignación de horas sustantivas por docente"
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      <div className="glass-panel p-4 space-y-3 relative z-10">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nombre, documento o correo…"
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
            {(applied.search || applied.areaId || applied.schoolId) && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-500 hover:bg-slate-100"
              >
                <XMarkIcon className="h-4 w-4" />
                Limpiar
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-200/60">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Área
                  </span>
                  <select
                    className={selectClass}
                    value={filters.areaId}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, areaId: e.target.value }))
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
                <label className="space-y-1">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Escuela
                  </span>
                  <select
                    className={selectClass}
                    value={filters.schoolId}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, schoolId: e.target.value }))
                    }
                  >
                    <option value="">Todas</option>
                    {schools.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="glass-panel overflow-hidden relative z-10">
        <div className="px-5 py-3 border-b border-slate-200/60 flex items-center justify-between">
          <p className="text-sm text-slate-500 font-medium">
            {loading
              ? 'Cargando…'
              : `${totalCount} docente${totalCount === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400 border-b border-slate-200/60">
                <th className="px-5 py-3 font-bold">Docente</th>
                <th className="px-5 py-3 font-bold hidden md:table-cell">
                  Área / Escuela
                </th>
                <th className="px-5 py-3 font-bold hidden lg:table-cell">
                  Contrato
                </th>
                <th className="px-5 py-3 font-bold text-right">Horas</th>
                <th className="px-5 py-3 font-bold text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-12 text-center text-slate-400"
                  >
                    No hay docentes para mostrar
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100/80 hover:bg-violet-50/30 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-800">{row.name}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      {row.document || '—'}
                      {row.email ? ` · ${row.email}` : ''}
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-slate-600">
                    <div>{row.area || '—'}</div>
                    <div className="text-xs text-slate-400">{row.school || '—'}</div>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-slate-600">
                    <div>{row.contractType || '—'}</div>
                    <div className="text-xs text-slate-400">
                      {row.contractHoursWeekly != null
                        ? `${row.contractHoursWeekly} h/sem`
                        : row.workSchedule || '—'}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right text-slate-600">
                    <div className="text-xs space-y-0.5">
                      <div>Cátedra: {row.catedraHours}</div>
                      <div>Prep.: {row.preparationHours}</div>
                      <div>Sust.: {row.substantiveHoursAssigned}</div>
                      {row.substantiveHoursRemaining != null && (
                        <div className="font-semibold text-violet-700">
                          Disp.: {row.substantiveHoursRemaining}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => void openAddModal(row)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 shadow-sm shadow-violet-500/20"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      Añadir horas sustantivas
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-200/60 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-slate-100"
            >
              Anterior
            </button>
            <span className="text-xs text-slate-500">
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-slate-100"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalTeacher && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeModal}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg glass-panel p-6 space-y-5 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-violet-600 mb-1">
                    <ClockIcon className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-wide">
                      Horas sustantivas
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">
                    {modalTeacher.name}
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {modalTeacher.document || 'Sin documento'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
                  aria-label="Cerrar"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Categoría
                </span>
                <select
                  className={selectClass}
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                >
                  {categories.map((c) => (
                    <option
                      key={c.id != null ? String(c.id) : c.name}
                      value={c.id != null ? String(c.id) : ''}
                    >
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Cantidad de horas
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Solo números enteros (ej. 4)"
                  className={selectClass}
                  value={hoursInput}
                  onChange={(e) => onHoursChange(e.target.value)}
                />
                <span className="text-[11px] text-slate-400">
                  Solo admite enteros (≥ 1). No se permiten decimales (0.5, etc.).
                </span>
              </label>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    Lista de tareas
                  </span>
                  <button
                    type="button"
                    onClick={addTaskRow}
                    className="inline-flex items-center gap-1 text-xs font-bold text-violet-700 hover:text-violet-900"
                  >
                    <PlusIcon className="h-3.5 w-3.5" />
                    Añadir tarea
                  </button>
                </div>
                <div className="space-y-2">
                  {tasks.map((task, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        placeholder={`Tarea ${idx + 1}`}
                        className={selectClass}
                        value={task}
                        onChange={(e) => updateTask(idx, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeTaskRow(idx)}
                        className="shrink-0 p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50"
                        aria-label="Eliminar tarea"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {formError && (
                <p className="text-sm text-rose-600 font-medium">{formError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  disabled={saving}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => void submitAssignment()}
                  disabled={saving}
                  className="glass-button-primary px-4 py-2.5 text-sm font-bold disabled:opacity-60"
                >
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
