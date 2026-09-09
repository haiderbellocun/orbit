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
  PencilSquareIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { Vacancy, Teacher, Coordinator } from '@/src/types';
import {
  getSubstantiveHoursTeachers,
  getSubstantiveHoursCategories,
  getSubstantiveHoursAssignments,
  createSubstantiveHoursAssignment,
  updateClassPreparationHours,
  getCatalogAreas,
  getCatalogSchools,
  getAcademicLoadSummary,
  type SubstantiveHoursTeacher,
  type SubstantiveHoursCategory,
  type SubstantiveHoursAssignment,
  type CatalogArea,
  type CatalogSchool,
} from '@/src/lib/api';
import { isHarveyAreaName } from '@/src/lib/harveyArea';
import { QuotaSummary } from '@/src/components/workload/QuotaSummary';
import { WeeklyHoursBadge } from '@/src/components/workload/WeeklyHoursBadge';
import type { QuotaStatus, TeachingModality } from '@/src/lib/workloadQuotaDisplay';

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
  period: string;
  contractHours: '' | '21' | '42';
  availability: '' | 'available' | 'none' | 'unknown';
  hasCatedra: '' | 'true' | 'false';
  hasSubstantive: '' | 'true' | 'false';
  withoutEduEmail: boolean;
  role: '' | 'docente' | 'docente_pensionado' | 'lite';
  teachingModality: '' | TeachingModality;
  quotaStatus: '' | QuotaStatus;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  areaId: '',
  schoolId: '',
  period: '',
  contractHours: '',
  availability: '',
  hasCatedra: '',
  hasSubstantive: '',
  withoutEduEmail: false,
  role: '',
  teachingModality: '',
  quotaStatus: '',
};

const PLACEHOLDER_CATEGORY = 'PEDIR LISTA CATEGORIAS HORAS SUSTANTIVAS';

type ActionMode = 'substantive' | 'preparation';

export const SubstantiveHoursView: React.FC<SubstantiveHoursViewProps> = ({
  onOpenVacancyFromNotification,
}) => {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [actionMode, setActionMode] = useState<ActionMode>('substantive');
  const [rows, setRows] = useState<SubstantiveHoursTeacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [periodOptions, setPeriodOptions] = useState<string[]>([]);

  const [modalTeacher, setModalTeacher] =
    useState<SubstantiveHoursTeacher | null>(null);
  const [modalKind, setModalKind] = useState<ActionMode>('substantive');
  const [categories, setCategories] = useState<SubstantiveHoursCategory[]>([]);
  const [categoryId, setCategoryId] = useState<string>('');
  const [hoursInput, setHoursInput] = useState('');
  const [prepHoursInput, setPrepHoursInput] = useState('');
  const [tasks, setTasks] = useState<string[]>(['']);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [existingAssignments, setExistingAssignments] = useState<
    SubstantiveHoursAssignment[]
  >([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);

  const selectClass =
    'w-full rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text shadow-sm focus:outline-none focus:ring-2 focus:ring-orbit-primary/30';

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, s, summary] = await Promise.all([
          getCatalogAreas(),
          getCatalogSchools(),
          getAcademicLoadSummary(),
        ]);
        if (cancelled) return;
        const areasList = (Array.isArray(a) ? a : []).filter(
          (area) => !isHarveyAreaName(area.name ?? '')
        );
        const harveyAreaIds = new Set(
          (Array.isArray(a) ? a : [])
            .filter((area) => isHarveyAreaName(area.name ?? ''))
            .map((area) => Number(area.id))
        );
        setAreas(areasList);
        setSchools(
          (Array.isArray(s) ? s : []).filter(
            (school) =>
              school.area_id == null || !harveyAreaIds.has(Number(school.area_id))
          )
        );
        const raw = summary as { periods?: unknown[] };
        const periods = Array.isArray(raw?.periods)
          ? raw.periods.map(String).filter(Boolean)
          : [];
        setPeriodOptions(periods);
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

  const schoolOptions = useMemo(() => {
    if (!filters.areaId) return schools;
    return schools.filter((s) => String(s.area_id ?? '') === filters.areaId);
  }, [schools, filters.areaId]);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSubstantiveHoursTeachers({
        search: applied.search.trim() || undefined,
        area_id: applied.areaId ? Number(applied.areaId) : undefined,
        school_id: applied.schoolId ? Number(applied.schoolId) : undefined,
        period: applied.period || undefined,
        contract_hours:
          applied.contractHours === '21' || applied.contractHours === '42'
            ? Number(applied.contractHours) as 21 | 42
            : undefined,
        availability: applied.availability || undefined,
        has_catedra:
          applied.hasCatedra === ''
            ? undefined
            : applied.hasCatedra === 'true',
        has_substantive:
          applied.hasSubstantive === ''
            ? undefined
            : applied.hasSubstantive === 'true',
        without_edu_email: applied.withoutEduEmail || undefined,
        role: applied.role || undefined,
        teaching_modality: applied.teachingModality || undefined,
        quota_status: applied.quotaStatus || undefined,
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
    if (applied.period) n++;
    if (applied.contractHours) n++;
    if (applied.availability) n++;
    if (applied.hasCatedra) n++;
    if (applied.hasSubstantive) n++;
    if (applied.withoutEduEmail) n++;
    if (applied.role) n++;
    if (applied.teachingModality) n++;
    if (applied.quotaStatus) n++;
    return n;
  }, [applied]);

  const hasActive = Boolean(applied.search.trim()) || activeFilterCount > 0;
  const openAddModal = async (teacher: SubstantiveHoursTeacher) => {
    setModalKind('substantive');
    setModalTeacher(teacher);
    setHoursInput('');
    setTasks(['']);
    setFormError(null);
    setCategoryId('');
    setExistingAssignments([]);
    setAssignmentsLoading(true);
    try {
      const [cats, assignments] = await Promise.all([
        getSubstantiveHoursCategories(),
        getSubstantiveHoursAssignments(Number(teacher.id)),
      ]);
      const list =
        Array.isArray(cats) && cats.length > 0
          ? cats
          : [{ id: null, name: PLACEHOLDER_CATEGORY }];
      setCategories(list);
      setCategoryId(list[0]?.id != null ? String(list[0].id) : '');
      setExistingAssignments(Array.isArray(assignments) ? assignments : []);
    } catch {
      setCategories([{ id: null, name: PLACEHOLDER_CATEGORY }]);
      setCategoryId('');
      setExistingAssignments([]);
    } finally {
      setAssignmentsLoading(false);
    }
  };

  const openPrepModal = (teacher: SubstantiveHoursTeacher) => {
    setModalKind('preparation');
    setModalTeacher(teacher);
    setPrepHoursInput(String(teacher.preparationHours ?? ''));
    setFormError(null);
    setAssignmentsLoading(false);
  };

  const openActionForRow = (teacher: SubstantiveHoursTeacher) => {
    if (actionMode === 'preparation') {
      openPrepModal(teacher);
      return;
    }
    void openAddModal(teacher);
  };

  const closeModal = () => {
    if (saving) return;
    setModalTeacher(null);
    setFormError(null);
    setExistingAssignments([]);
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

  const onPrepHoursChange = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    setPrepHoursInput(digits);
  };

  const prepBalancePreview = useMemo(() => {
    if (!modalTeacher || modalKind !== 'preparation') return null;
    if (modalTeacher.contractHoursWeekly == null) return null;
    const prep = /^\d+$/.test(prepHoursInput)
      ? Number.parseInt(prepHoursInput, 10)
      : null;
    if (prep == null) return null;
    return (
      modalTeacher.contractHoursWeekly -
      modalTeacher.catedraHours -
      prep -
      modalTeacher.substantiveHoursAssigned
    );
  }, [modalTeacher, modalKind, prepHoursInput]);

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
      setHoursInput('');
      setTasks(['']);
      const [assignments] = await Promise.all([
        getSubstantiveHoursAssignments(Number(modalTeacher.id)),
        loadList(),
      ]);
      setExistingAssignments(assignments);
    } catch (e) {
      setFormError(
        e instanceof Error ? e.message : 'No se pudo guardar la asignación'
      );
    } finally {
      setSaving(false);
    }
  };

  const submitPreparation = async () => {
    if (!modalTeacher) return;
    setFormError(null);
    if (!/^\d+$/.test(prepHoursInput)) {
      setFormError('La preparación debe ser un entero ≥ 0.');
      return;
    }
    const hours = Number.parseInt(prepHoursInput, 10);
    setSaving(true);
    try {
      await updateClassPreparationHours(Number(modalTeacher.id), hours);
      await loadList();
      setModalTeacher(null);
    } catch (e) {
      setFormError(
        e instanceof Error
          ? e.message
          : 'No se pudo actualizar la preparación de clase'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-8 relative">
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Balance carga"
        subtitle="Balance semanal: cátedra, preparación y horas sustantivas"
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      <div
        data-tutorial="substantive-modes"
        className="glass-panel p-1.5 relative z-10 inline-flex w-full sm:w-auto gap-1 rounded-2xl"
      >
        <button
          type="button"
          onClick={() => setActionMode('substantive')}
          className={cn(
            'flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-bold transition-colors',
            actionMode === 'substantive'
              ? 'bg-orbit-primary text-white shadow-sm '
              : 'text-orbit-text-secondary hover:bg-orbit-interactive'
          )}
        >
          Horas sustantivas
        </button>
        <button
          type="button"
          onClick={() => setActionMode('preparation')}
          className={cn(
            'flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-sm font-bold transition-colors',
            actionMode === 'preparation'
              ? 'bg-orbit-primary text-white shadow-sm '
              : 'text-orbit-text-secondary hover:bg-orbit-interactive'
          )}
        >
          Preparación clase
        </button>
      </div>
      <div data-tutorial="substantive-filters" className="glass-panel p-4 space-y-3 relative z-10">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
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
                  ? 'bg-orbit-primary/10 border-orbit-primary/30 text-orbit-primary'
                  : 'bg-orbit-bg-secondary border-orbit-border/80 text-orbit-text-secondary hover:bg-orbit-bg-secondary'
              )}
              aria-expanded={filtersOpen}
            >
              <FunnelIcon className="h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="min-w-5 h-5 px-1.5 rounded-md bg-orbit-primary text-white text-[10px] flex items-center justify-center">
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
            {(hasActive) && (
              <button
                type="button"
                onClick={clearFilters}
                className="inline-flex items-center gap-1 px-3 py-2.5 rounded-xl text-sm font-semibold text-orbit-muted hover:bg-orbit-interactive"
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
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2 border-t border-orbit-border/60">
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Rol
                  </span>
                  <select
                    className={selectClass}
                    value={filters.role}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        role: e.target.value as Filters['role'],
                      }))
                    }
                  >
                    <option value="">Todos</option>
                    <option value="docente">Docente</option>
                    <option value="docente_pensionado">
                      Docente pensionado
                    </option>
                    <option value="lite">LITE</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
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
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Escuela
                  </span>
                  <select
                    className={selectClass}
                    value={filters.schoolId}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, schoolId: e.target.value }))
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
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Periodo (cátedra)
                  </span>
                  <select
                    className={selectClass}
                    value={filters.period}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, period: e.target.value }))
                    }
                  >
                    <option value="">Todos</option>
                    {periodOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Jornada
                  </span>
                  <select
                    className={selectClass}
                    value={filters.contractHours}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        contractHours: e.target.value as Filters['contractHours'],
                      }))
                    }
                  >
                    <option value="">Todas</option>
                    <option value="42">Tiempo completo (42 h)</option>
                    <option value="21">Medio tiempo (21 h)</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Disponibilidad
                  </span>
                  <select
                    className={selectClass}
                    value={filters.availability}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        availability: e.target
                          .value as Filters['availability'],
                      }))
                    }
                  >
                    <option value="">Todas</option>
                    <option value="available">Con horas disponibles</option>
                    <option value="none">Sin horas disponibles</option>
                    <option value="unknown">Sin jornada definida</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Cátedra
                  </span>
                  <select
                    className={selectClass}
                    value={filters.hasCatedra}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        hasCatedra: e.target.value as Filters['hasCatedra'],
                      }))
                    }
                  >
                    <option value="">Todas</option>
                    <option value="true">Con cátedra</option>
                    <option value="false">Sin cátedra</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Sustantivas
                  </span>
                  <select
                    className={selectClass}
                    value={filters.hasSubstantive}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        hasSubstantive: e.target
                          .value as Filters['hasSubstantive'],
                      }))
                    }
                  >
                    <option value="">Todas</option>
                    <option value="true">Con horas sustantivas</option>
                    <option value="false">Sin horas sustantivas</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Modalidad enseñanza
                  </span>
                  <select
                    className={selectClass}
                    value={filters.teachingModality}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        teachingModality: e.target
                          .value as Filters['teachingModality'],
                      }))
                    }
                  >
                    <option value="">Todas</option>
                    <option value="presencial">Presencial</option>
                    <option value="virtual">Virtual</option>
                    <option value="mixto">Mixto</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                    Porcentaje de ocupación semanal
                  </span>
                  <select
                    className={selectClass}
                    value={filters.quotaStatus}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        quotaStatus: e.target.value as Filters['quotaStatus'],
                      }))
                    }
                  >
                    <option value="">Todos</option>
                    <option value="under">Faltante</option>
                    <option value="ok">Completo</option>
                    <option value="over">Exceso</option>
                  </select>
                </label>
                <label className="inline-flex items-center gap-2 text-sm text-orbit-text-secondary cursor-pointer sm:col-span-2 lg:col-span-3 pt-1">
                  <input
                    type="checkbox"
                    checked={filters.withoutEduEmail}
                    onChange={(e) =>
                      setFilters((f) => ({
                        ...f,
                        withoutEduEmail: e.target.checked,
                      }))
                    }
                    className="rounded border-orbit-border text-orbit-primary focus:ring-violet-400"
                  />
                  Sin correo CUN
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="glass-panel overflow-hidden relative z-10">
        <div className="px-5 py-3 border-b border-orbit-border/60 flex items-center justify-between">
          <p className="text-sm text-orbit-muted font-medium">
            {loading
              ? 'Cargando…'
              : `${totalCount} docente${totalCount === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-orbit-muted border-b border-orbit-border/60">
                <th className="px-5 py-3 font-bold">Docente</th>
                <th className="px-5 py-3 font-bold hidden md:table-cell">
                  Área / Escuela
                </th>
                <th className="px-5 py-3 font-bold hidden lg:table-cell">
                  Contrato
                </th>
                <th className="px-5 py-3 font-bold text-right">Horas</th>
                <th className="px-5 py-3 font-bold">Cuota</th>
                <th className="px-5 py-3 font-bold text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-orbit-muted"
                  >
                    No hay docentes para mostrar
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-orbit-border/80 hover:bg-orbit-interactive/30 transition-colors',
                    row.isLite && 'bg-amber-50/70 dark:bg-amber-500/10 hover:bg-amber-50 dark:bg-amber-500/12'
                  )}
                >
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-orbit-text">{row.name}</span>
                      {row.isLite && (
                        <span
                          className="inline-flex items-center rounded-md border border-amber-200 dark:border-amber-500/28 bg-amber-50 dark:bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200"
                          title="Rol actual LITE: tiene cátedra, no es docente de planta"
                        >
                          LITE
                        </span>
                      )}
                      <WeeklyHoursBadge
                        hours={row.contractHoursWeekly}
                        workSchedule={row.workSchedule}
                      />
                    </div>
                    {row.isLite && (
                      <div className="text-[11px] font-medium text-amber-800/80 dark:text-amber-200/80 mt-0.5">
                        Tiene cátedra · rol actual LITE
                      </div>
                    )}
                    <div className="text-xs text-orbit-muted mt-0.5">
                      {row.document || '—'}
                      {' · '}
                      {row.email?.trim() ? (
                        row.email.trim()
                      ) : (
                        <span className="text-red-600 dark:text-red-300 font-semibold">
                          sin correo CUN
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 lg:hidden">
                      <span className="text-[11px] text-orbit-muted">
                        {row.contractType || 'Sin tipo de contrato'}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 hidden md:table-cell text-orbit-text-secondary">
                    <div>{row.area || '—'}</div>
                    <div className="text-xs text-orbit-muted">{row.school || '—'}</div>
                  </td>
                  <td className="px-5 py-4 hidden lg:table-cell text-orbit-text-secondary">
                    <div className="font-medium text-orbit-text">
                      {row.contractType || '—'}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-right text-orbit-text-secondary">
                    <div className="inline-flex flex-col items-end gap-1 text-xs tabular-nums">
                      {row.contractHoursWeekly != null && (
                        <div className="rounded-md border border-sky-200 dark:border-sky-500/28 bg-sky-50 dark:bg-sky-500/12 px-2 py-0.5 font-bold text-sky-900 dark:text-sky-100">
                          Jornada {row.contractHoursWeekly} h/sem
                        </div>
                      )}
                      <div className="space-y-0.5 text-right">
                        <div>
                          <span className="text-orbit-muted">Cátedra</span>{' '}
                          <span className="font-semibold text-orbit-text">
                            {row.catedraHours} h
                          </span>
                        </div>
                        <div>
                          <span className="text-orbit-muted">Preparación</span>{' '}
                          <span className="font-semibold text-orbit-text">
                            {row.preparationHours} h
                          </span>
                        </div>
                        <div>
                          <span className="text-orbit-muted">Sustantivas</span>{' '}
                          <span className="font-semibold text-orbit-text">
                            {row.substantiveHoursAssigned} h
                          </span>
                        </div>
                        {row.substantiveHoursRemaining != null && (
                          <div className="font-bold text-orbit-primary pt-0.5">
                            Disponibles {row.substantiveHoursRemaining} h
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <QuotaSummary
                      compact
                      quota={{
                        teachingModality: row.teachingModality ?? null,
                        creditsPresencial: row.creditsPresencial ?? 0,
                        studentsVirtual: row.studentsVirtual ?? 0,
                        creditTarget: row.creditTarget ?? null,
                        studentTarget: row.studentTarget ?? null,
                        loadIndex: row.loadIndex ?? null,
                        fulfillmentPct: row.fulfillmentPct ?? null,
                        quotaStatus: row.quotaStatus ?? 'unknown',
                        creditsGap: row.creditsGap ?? null,
                        studentsGap: row.studentsGap ?? null,
                        actionHint: row.actionHint ?? null,
                      }}
                    />
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => openActionForRow(row)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-orbit-primary text-white hover:bg-orbit-primary-hover shadow-sm "
                    >
                      {actionMode === 'preparation' ? (
                        <>
                          <PencilSquareIcon className="h-3.5 w-3.5" />
                          Modificar preparación
                        </>
                      ) : (
                        <>
                          <PlusIcon className="h-3.5 w-3.5" />
                          Añadir horas sustantivas
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-5 py-3 border-t border-orbit-border/60 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-orbit-interactive"
            >
              Anterior
            </button>
            <span className="text-xs text-orbit-muted">
              Página {currentPage} de {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages, p + 1))
              }
              className="px-3 py-1.5 rounded-lg text-sm font-semibold disabled:opacity-40 hover:bg-orbit-interactive"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {modalTeacher && (
          <motion.div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
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
              className="w-full max-w-lg glass-panel p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 text-orbit-primary mb-1">
                    {modalKind === 'preparation' ? (
                      <PencilSquareIcon className="h-5 w-5" />
                    ) : (
                      <ClockIcon className="h-5 w-5" />
                    )}
                    <span className="text-xs font-bold uppercase tracking-wide">
                      {modalKind === 'preparation'
                        ? 'Preparación de clase'
                        : 'Horas sustantivas'}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-orbit-text flex items-center gap-2 flex-wrap">
                    {modalTeacher.name}
                    {modalTeacher.isLite && (
                      <span className="inline-flex items-center rounded-md border border-amber-200 dark:border-amber-500/28 bg-amber-50 dark:bg-amber-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                        LITE
                      </span>
                    )}
                    <WeeklyHoursBadge
                      hours={modalTeacher.contractHoursWeekly}
                      workSchedule={modalTeacher.workSchedule}
                      size="md"
                    />
                  </h2>
                  <p className="text-xs text-orbit-muted mt-0.5">
                    {modalTeacher.document || 'Sin documento'}
                  </p>
                  {modalTeacher.isLite && (
                    <p className="text-[11px] font-medium text-amber-800 dark:text-amber-200 mt-1">
                      Es LITE y tiene carga académica. El balance incluye su cátedra para que no quede por fuera.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={closeModal}
                  className="p-2 rounded-lg text-orbit-muted hover:bg-orbit-interactive"
                  aria-label="Cerrar"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              {modalKind === 'preparation' ? (
                <>
                  <div className="rounded-xl border border-sky-200 dark:border-sky-500/28 bg-sky-50/80 dark:bg-sky-500/12 p-3 text-xs text-orbit-text-secondary space-y-1 tabular-nums">
                    <div className="flex justify-between gap-3">
                      <span className="font-semibold text-sky-900 dark:text-sky-100">Jornada semanal</span>
                      <span className="font-bold text-sky-950 dark:text-sky-100 text-sm">
                        {modalTeacher.contractHoursWeekly != null
                          ? `${modalTeacher.contractHoursWeekly} h`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Cátedra</span>
                      <span className="font-semibold text-orbit-text">
                        {modalTeacher.catedraHours} h
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Sustantivas</span>
                      <span className="font-semibold text-orbit-text">
                        {modalTeacher.substantiveHoursAssigned} h
                      </span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>Preparación actual</span>
                      <span className="font-semibold text-orbit-text">
                        {modalTeacher.preparationHours} h
                      </span>
                    </div>
                  </div>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                      Horas de preparación (semanal)
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="Ej. 4"
                      className={selectClass}
                      value={prepHoursInput}
                      onChange={(e) => onPrepHoursChange(e.target.value)}
                    />
                    <span className="text-[11px] text-orbit-muted">
                      Entero ≥ 0. No puede dejar el balance semanal en negativo.
                    </span>
                  </label>

                  {prepBalancePreview != null && (
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        prepBalancePreview < 0
                          ? 'text-orbit-danger'
                          : 'text-orbit-primary'
                      )}
                    >
                      Disponibles tras el cambio: {prepBalancePreview} h/sem
                    </p>
                  )}

                  {formError && (
                    <p className="text-sm text-orbit-danger font-medium">
                      {formError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={saving}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold text-orbit-text-secondary hover:bg-orbit-interactive"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => void submitPreparation()}
                      disabled={saving}
                      className="glass-button-primary px-4 py-2.5 text-sm font-bold disabled:opacity-60"
                    >
                      {saving ? 'Guardando…' : 'Guardar preparación'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {assignmentsLoading ? (
                    <p className="text-sm text-orbit-muted">
                      Cargando asignaciones…
                    </p>
                  ) : existingAssignments.length > 0 ? (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                        Asignaciones registradas
                      </span>
                      <ul className="space-y-2 max-h-40 overflow-y-auto rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary/50 p-3">
                        {existingAssignments.map((a) => (
                          <li
                            key={a.id}
                            className="text-sm text-orbit-text-secondary border-b border-orbit-border/60 last:border-0 pb-2 last:pb-0"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">
                                {a.categoryName}
                              </span>
                              <span className="text-orbit-primary font-bold shrink-0">
                                {a.hoursQuantity} h
                              </span>
                            </div>
                            {a.tasks.length > 0 && (
                              <ul className="mt-1 text-xs text-orbit-muted list-disc list-inside">
                                {a.tasks.map((t) => (
                                  <li key={t.id}>{t.description}</li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <label className="block space-y-1.5">
                    <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
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
                    <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
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
                    <span className="text-[11px] text-orbit-muted">
                      Solo admite enteros (≥ 1). No se permiten decimales (0.5,
                      etc.).
                    </span>
                  </label>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-orbit-muted uppercase tracking-wide">
                        Lista de tareas
                      </span>
                      <button
                        type="button"
                        onClick={addTaskRow}
                        className="inline-flex items-center gap-1 text-xs font-bold text-orbit-primary hover:text-orbit-primary"
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
                            className="shrink-0 p-2.5 rounded-xl border border-orbit-border text-orbit-muted hover:text-orbit-danger hover:border-orbit-danger/40 hover:bg-orbit-danger/10"
                            aria-label="Eliminar tarea"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {formError && (
                    <p className="text-sm text-orbit-danger font-medium">
                      {formError}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={saving}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold text-orbit-text-secondary hover:bg-orbit-interactive"
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
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
