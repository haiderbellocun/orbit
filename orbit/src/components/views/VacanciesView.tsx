import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  BriefcaseIcon,
  QueueListIcon,
  FunnelIcon,
  ChevronDownIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { Vacancy, Teacher, Coordinator, VacancyOperationStatus } from '@/src/types';
import {
  getVacancies,
  getStoredCapabilities,
  deleteVacancy,
  downloadVacanciesExcel,
} from '@/src/lib/api';
import {
  computeVacancyActiveDaysFromSent,
  formatVacancyActiveDaysLabel,
  vacancyActiveDaysTooltip,
} from '@/src/lib/vacancyActiveDays';
import {
  STATUS_LABEL,
  canOpenVacancyManage,
} from '@/src/lib/vacancyFormHelpers';
import { canVacancyAdmin } from '@/src/lib/permissions';
import { ConfirmTextModal } from '@/src/components/common/ConfirmTextModal';
import { VacancyManageModal } from '@/src/components/views/VacancyManageModal';
import { VacancyStatusChart } from '@/src/components/views/VacancyStatusChart';

type ManagePanel =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; vacancy: Vacancy };

const STATUS_ORDER: VacancyOperationStatus[] = [
  'open',
  'selected',
  'requisition_sent',
  'internal_movement',
  'hired',
  'closed',
  'cancelled',
  'cancelled_by_capital',
];

type VacancyDateField = 'createdAt' | 'sentToCapitalAt';

type Filters = {
  search: string;
  status: VacancyOperationStatus | '';
  areaId: string;
  schoolId: string;
  programId: string;
  dateField: VacancyDateField;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  status: '',
  areaId: '',
  schoolId: '',
  programId: '',
  dateField: 'createdAt',
  dateFrom: '',
  dateTo: '',
};

const numberFormatter = new Intl.NumberFormat('es-CO');

function vacancyDateValue(v: Vacancy, field: VacancyDateField): string | null {
  const raw = field === 'createdAt' ? v.createdAt : v.sentToCapitalAt;
  if (!raw?.trim()) return null;
  return raw.slice(0, 10);
}

function matchesDateRange(
  v: Vacancy,
  field: VacancyDateField,
  from: string,
  to: string
): boolean {
  const day = vacancyDateValue(v, field);
  if (!day) return !from && !to;
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

function matchesSearch(v: Vacancy, search: string): boolean {
  const q = search.trim().toLowerCase();
  if (!q) return true;
  return (
    v.positionName.toLowerCase().includes(q) ||
    (v.programName ?? '').toLowerCase().includes(q) ||
    (v.areaName ?? '').toLowerCase().includes(q) ||
    (v.schoolName ?? '').toLowerCase().includes(q) ||
    v.id.toLowerCase().includes(q) ||
    (v.reqNumber ?? '').toLowerCase().includes(q)
  );
}

function vacancyMatchesFilters(
  v: Vacancy,
  applied: Filters,
  options?: { ignoreStatus?: boolean }
): boolean {
  if (!options?.ignoreStatus && applied.status && v.operationStatus !== applied.status) {
    return false;
  }
  if (applied.areaId && String(v.areaId) !== applied.areaId) return false;
  if (applied.schoolId && String(v.schoolId ?? '') !== applied.schoolId) return false;
  if (applied.programId && String(v.programId ?? '') !== applied.programId) return false;
  if (
    !matchesDateRange(v, applied.dateField, applied.dateFrom, applied.dateTo)
  ) {
    return false;
  }
  return matchesSearch(v, applied.search);
}

function uniqueSortedOptions(
  rows: Vacancy[],
  getLabel: (v: Vacancy) => string | null | undefined,
  getValue: (v: Vacancy) => string
): { value: string; label: string }[] {
  const map = new Map<string, string>();
  for (const row of rows) {
    const label = getLabel(row)?.trim();
    if (!label) continue;
    const value = getValue(row);
    if (!map.has(value)) map.set(value, label);
  }
  return [...map.entries()]
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

interface VacanciesViewProps {
  onSelectVacancy: (v: Vacancy) => void;
  onVacancySaved?: (v: Vacancy) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

export const VacanciesView: React.FC<VacanciesViewProps> = ({
  onSelectVacancy,
  onVacancySaved,
  onOpenVacancyFromNotification,
}) => {
  const [rows, setRows] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [managePanel, setManagePanel] = useState<ManagePanel>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vacancy | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const isVacancyAdmin = canVacancyAdmin(getStoredCapabilities());

  const selectClass =
    'w-full rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text shadow-sm focus:outline-none focus:ring-2 focus:ring-orbit-primary/30';

  const refresh = useCallback(async (): Promise<Vacancy[]> => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getVacancies();
      const list = Array.isArray(res.data) ? res.data : [];
      setRows(list);
      return list;
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : 'No se pudo cargar');
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!saveBanner) return;
    const t = window.setTimeout(() => setSaveBanner(null), 4500);
    return () => window.clearTimeout(t);
  }, [saveBanner]);

  useEffect(() => {
    if (filters.search === applied.search) return;
    const t = window.setTimeout(() => {
      setApplied((prev) => ({ ...prev, search: filters.search }));
    }, 300);
    return () => window.clearTimeout(t);
  }, [filters.search, applied.search]);

  const areaOptions = useMemo(
    () =>
      uniqueSortedOptions(
        rows,
        (v) => v.areaName,
        (v) => String(v.areaId)
      ),
    [rows]
  );

  const schoolOptions = useMemo(() => {
    const scoped = filters.areaId
      ? rows.filter((v) => String(v.areaId) === filters.areaId)
      : rows;
    return uniqueSortedOptions(
      scoped,
      (v) => v.schoolName,
      (v) => String(v.schoolId ?? '')
    ).filter((o) => o.value !== '');
  }, [rows, filters.areaId]);

  const programOptions = useMemo(() => {
    let scoped = rows;
    if (filters.areaId) {
      scoped = scoped.filter((v) => String(v.areaId) === filters.areaId);
    }
    if (filters.schoolId) {
      scoped = scoped.filter(
        (v) => String(v.schoolId ?? '') === filters.schoolId
      );
    }
    return uniqueSortedOptions(
      scoped,
      (v) => v.programName,
      (v) => String(v.programId ?? '')
    ).filter((o) => o.value !== '');
  }, [rows, filters.areaId, filters.schoolId]);

  const statusOptions = useMemo(() => {
    const counts = new Map<VacancyOperationStatus, number>();
    for (const v of rows) {
      counts.set(v.operationStatus, (counts.get(v.operationStatus) ?? 0) + 1);
    }
    return STATUS_ORDER.map((s) => ({
      status: s,
      count: counts.get(s) ?? 0,
    }));
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((v) => vacancyMatchesFilters(v, applied)),
    [rows, applied]
  );

  const chartRows = useMemo(
    () => rows.filter((v) => vacancyMatchesFilters(v, applied, { ignoreStatus: true })),
    [rows, applied]
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.status) n++;
    if (applied.areaId) n++;
    if (applied.schoolId) n++;
    if (applied.programId) n++;
    if (applied.dateFrom) n++;
    if (applied.dateTo) n++;
    return n;
  }, [applied]);

  const hasActiveFilters =
    activeFilterCount > 0 || applied.search.trim() !== '';

  const filteredQuantityTotal = useMemo(
    () => filtered.reduce((sum, v) => sum + (v.quantity ?? 0), 0),
    [filtered]
  );

  const filteredHiredTotal = useMemo(
    () => filtered.reduce((sum, v) => sum + (v.hiredQuantity ?? 0), 0),
    [filtered]
  );

  const applyFilters = () => {
    setApplied({ ...filters });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
  };

  function selectStatusFromChart(status: VacancyOperationStatus | '') {
    setFilters((f) => ({ ...f, status }));
    setApplied((a) => ({ ...a, status }));
  }

  async function handleExportExcel() {
    setExporting(true);
    setLoadError(null);
    try {
      await downloadVacanciesExcel({
        search: applied.search,
        status: applied.status || undefined,
        areaId: applied.areaId || undefined,
        schoolId: applied.schoolId || undefined,
        programId: applied.programId || undefined,
        dateField: applied.dateField,
        dateFrom: applied.dateFrom || undefined,
        dateTo: applied.dateTo || undefined,
      });
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'No se pudo descargar el Excel'
      );
    } finally {
      setExporting(false);
    }
  }

  function openEdit(v: Vacancy) {
    setSaveBanner(null);
    setManagePanel({ mode: 'edit', vacancy: v });
  }

  async function handleModalSaved(v: Vacancy, message: string) {
    const list = await refresh();
    const fresh = list.find((x) => x.id === v.id) ?? v;
    onVacancySaved?.(fresh);
    setSaveBanner(message);
    setManagePanel(null);
  }

  return (
    <div className="space-y-5 relative">
      <Header
        title="Gestión de Vacantes"
        subtitle="Creación y seguimiento operativo"
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
        <div className="glass-card flex items-center gap-3 p-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-orbit-primary/25 bg-orbit-primary/10 text-orbit-primary">
            <BriefcaseIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="orbit-label normal-case">Total solicitado</p>
            <p className="orbit-metric-value text-xl">
              {loading ? '—' : numberFormatter.format(filteredQuantityTotal)}
            </p>
          </div>
        </div>
        <div className="glass-card flex items-center gap-3 p-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-orbit-success/25 bg-orbit-success/10 text-orbit-success">
            <BriefcaseIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="orbit-label normal-case">Total contratado</p>
            <p className="orbit-metric-value text-xl">
              {loading ? '—' : numberFormatter.format(filteredHiredTotal)}
            </p>
          </div>
        </div>
        <div className="glass-card flex items-center gap-3 p-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-orbit-info/25 bg-orbit-info/10 text-orbit-info">
            <QueueListIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="orbit-label normal-case">Registros</p>
            <p className="orbit-metric-value text-xl">
              {loading ? '—' : numberFormatter.format(filtered.length)}
            </p>
            <p className="text-[11px] text-orbit-muted mt-0.5">
              {hasActiveFilters
                ? `De ${numberFormatter.format(rows.length)} en total`
                : 'Filas visibles'}
            </p>
          </div>
        </div>
      </div>

      <VacancyStatusChart
        vacancies={chartRows}
        loading={loading}
        activeStatus={applied.status}
        onSelectStatus={selectStatusFromChart}
      />

      <div data-tutorial="vacancies-filters" className="relative z-10 flex flex-col gap-4">
        <div className="glass-panel p-4 space-y-3 w-full">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="relative flex-1">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
              <input
                type="search"
                placeholder="Buscar por cargo, programa, área, REQ…"
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyFilters();
                }}
                className={cn(selectClass, 'pl-10')}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
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
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-orbit-muted hover:text-orbit-danger hover:bg-orbit-danger/10/60 transition-colors"
                  title="Limpiar filtros"
                >
                  <XMarkIcon className="h-4 w-4" />
                  Limpiar
                </button>
              )}
              <button
                type="button"
                onClick={() => void handleExportExcel()}
                disabled={exporting || loading || filtered.length === 0}
                title={
                  hasActiveFilters
                    ? 'Descarga las vacantes visibles (respeta filtros)'
                    : 'Descargar Excel de vacantes'
                }
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold border border-orbit-border/80 bg-orbit-bg-secondary text-orbit-text-secondary hover:bg-orbit-interactive hover:border-orbit-primary/40 hover:text-orbit-primary-hover transition-colors disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap"
              >
                <ArrowDownTrayIcon className="h-4 w-4" />
                {exporting ? 'Generando…' : 'Descargar Excel'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaveBanner(null);
                  setManagePanel({ mode: 'create' });
                }}
                data-tutorial="vacancies-create"
                className="glass-button-primary inline-flex items-center gap-1.5 px-4 py-2.5 text-sm whitespace-nowrap"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Nueva vacante</span>
              </button>
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
                <div className="pt-3 border-t border-orbit-border space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Estado
                      </span>
                      <select
                        className={selectClass}
                        value={filters.status}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            status: e.target.value as VacancyOperationStatus | '',
                          }))
                        }
                      >
                        <option value="">Todos ({rows.length})</option>
                        {statusOptions.map(({ status, count }) => (
                          <option key={status} value={status}>
                            {STATUS_LABEL[status]} ({count})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
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
                            programId: '',
                          }))
                        }
                      >
                        <option value="">Todas</option>
                        {areaOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Escuela
                      </span>
                      <select
                        className={selectClass}
                        value={filters.schoolId}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            schoolId: e.target.value,
                            programId: '',
                          }))
                        }
                      >
                        <option value="">
                          {filters.areaId ? 'Todas del área' : 'Todas'}
                        </option>
                        {schoolOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Programa
                      </span>
                      <select
                        className={selectClass}
                        value={filters.programId}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            programId: e.target.value,
                          }))
                        }
                      >
                        <option value="">Todos</option>
                        {programOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Fecha según
                      </span>
                      <select
                        className={selectClass}
                        value={filters.dateField}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            dateField: e.target.value as VacancyDateField,
                          }))
                        }
                      >
                        <option value="createdAt">Fecha de creación</option>
                        <option value="sentToCapitalAt">Envío a capital</option>
                      </select>
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Desde
                      </span>
                      <input
                        type="date"
                        className={selectClass}
                        value={filters.dateFrom}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            dateFrom: e.target.value,
                          }))
                        }
                      />
                    </label>
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Hasta
                      </span>
                      <input
                        type="date"
                        className={selectClass}
                        value={filters.dateTo}
                        onChange={(e) =>
                          setFilters((f) => ({
                            ...f,
                            dateTo: e.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {saveBanner && (
          <div
            role="status"
            className="glass-panel px-4 py-3 text-sm font-medium text-orbit-success bg-orbit-success/10 border border-orbit-success/30 rounded-2xl shadow-sm"
          >
            {saveBanner}
          </div>
        )}

        {loadError && (
          <div className="glass-panel p-4 text-sm text-orbit-danger bg-orbit-danger/10 border border-orbit-danger/30">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 overflow-hidden rounded-2xl w-full">
            <div className="h-10 w-10 rounded-full border-2 border-orbit-primary border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-orbit-text-secondary">
              Cargando vacantes...
            </p>
          </div>
        ) : (
          <div className="glass-panel p-0 overflow-x-auto rounded-2xl w-full">
            <table className="w-full min-w-[1120px] text-left text-[15px] table-fixed border-collapse">
              <colgroup>
                <col className="w-[9%]" />
                <col className="w-[10%]" />
                <col className="w-[11%]" />
                <col className="w-[11%]" />
                <col className="w-[10%]" />
                <col className="w-[15%]" />
                <col className="w-[5%]" />
                <col className="w-[5%]" />
                <col className="w-[11%]" />
                <col className="w-[13%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-orbit-border/80 bg-orbit-bg-secondary/80 dark:bg-orbit-elevated/80 text-xs uppercase tracking-widest text-orbit-muted">
                  <th className="py-3 px-3 font-bold whitespace-nowrap text-left">
                    # Requisición
                  </th>
                  <th className="py-3 px-3 font-bold text-left leading-tight whitespace-normal">
                    Tiempo activo
                  </th>
                  <th className="py-3 px-3 font-bold">Área</th>
                  <th className="py-3 px-4 font-bold">Escuela</th>
                  <th className="py-3 px-4 font-bold">Programa</th>
                  <th className="py-3 px-4 font-bold">Cargo</th>
                  <th className="py-3 px-4 font-bold text-center">Solic.</th>
                  <th className="py-3 px-4 font-bold text-center">Contr.</th>
                  <th className="py-3 px-4 font-bold whitespace-nowrap">Estado</th>
                  <th className="py-3 px-4 font-bold text-right whitespace-nowrap">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={10}
                      className="py-16 text-center text-orbit-muted text-[15px]"
                    >
                      No hay vacantes para mostrar.
                    </td>
                  </tr>
                ) : (
                  filtered.map((v) => (
                    <tr
                      key={v.id}
                      className="border-b border-orbit-border/80 hover:bg-orbit-interactive/30 transition-colors"
                    >
                      <td className="py-3 px-3 text-orbit-text-secondary text-sm align-top">
                        {v.reqNumber?.trim() ? (
                          <span
                            className="block font-medium leading-snug break-words"
                            title={v.reqNumber}
                          >
                            {v.reqNumber}
                          </span>
                        ) : null}
                      </td>
                      <td
                        className="py-3 px-3 text-orbit-text-secondary align-top"
                        title={
                          v.sentToCapitalAt
                            ? vacancyActiveDaysTooltip(v.sentToCapitalAt)
                            : 'SIN FECHA DE ENVÍO'
                        }
                      >
                        <span className="block font-semibold text-orbit-primary text-[11px] leading-snug uppercase tracking-wide whitespace-normal break-words">
                          {v.sentToCapitalAt
                            ? formatVacancyActiveDaysLabel(
                                computeVacancyActiveDaysFromSent(
                                  v.sentToCapitalAt
                                )
                              )
                            : 'SIN FECHA DE ENVÍO'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-orbit-text align-top">
                        <span className="line-clamp-2" title={v.areaName ?? ''}>
                          {v.areaName ?? '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-orbit-text align-top">
                        <span
                          className="line-clamp-2"
                          title={v.schoolName ?? ''}
                        >
                          {v.schoolName ?? '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-orbit-text-secondary align-top">
                        <span
                          className="line-clamp-2"
                          title={v.programName ?? ''}
                        >
                          {v.programName ?? '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-medium text-orbit-text align-top">
                        <span className="line-clamp-2" title={v.positionName}>
                          {v.positionName}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-orbit-text tabular-nums align-top">
                        {v.quantity}
                      </td>
                      <td className="py-3 px-4 text-center text-orbit-text tabular-nums align-top">
                        <span
                          title={
                            v.hiredQuantity < v.quantity
                              ? `${v.quantity - v.hiredQuantity} pendiente(s)`
                              : 'Completamente contratado'
                          }
                        >
                          {v.hiredQuantity ?? 0}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <span
                          className={cn(
                            'inline-flex px-2 py-0.5 rounded-md text-xs font-bold border',
                            v.operationStatus === 'open' &&
                              'bg-orbit-info/10 text-blue-700 dark:text-blue-300 border-blue-100 dark:border-blue-500/25',
                            v.operationStatus === 'selected' &&
                              'bg-orbit-warning/10 text-amber-800 dark:text-amber-200 border-orbit-warning/30',
                            v.operationStatus === 'requisition_sent' &&
                              'bg-orbit-primary/10 text-orbit-primary-hover border-orbit-primary/25',
                            v.operationStatus === 'internal_movement' &&
                              'bg-orbit-info/10 text-orbit-info border-orbit-info/25',
                            v.operationStatus === 'hired' &&
                              'bg-orbit-success/10 text-orbit-success border-orbit-success/25',
                            (v.operationStatus === 'closed' ||
                              v.operationStatus === 'cancelled' ||
                              v.operationStatus ===
                                'cancelled_by_capital') &&
                              'bg-orbit-interactive text-orbit-text-secondary border-orbit-border'
                          )}
                        >
                          {STATUS_LABEL[v.operationStatus]}
                        </span>
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="flex flex-wrap gap-1 justify-end">
                          <button
                            type="button"
                            title="Ver detalle"
                            onClick={() => onSelectVacancy(v)}
                            className="p-1.5 rounded-lg bg-orbit-elevated border border-orbit-border text-orbit-text-secondary hover:text-orbit-primary hover:border-orbit-primary/40"
                          >
                            <EyeIcon className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Gestionar vacante y requisición"
                            disabled={
                              !canOpenVacancyManage(
                                v.operationStatus,
                                isVacancyAdmin
                              )
                            }
                            onClick={() => {
                              if (
                                !canOpenVacancyManage(
                                  v.operationStatus,
                                  isVacancyAdmin
                                )
                              )
                                return;
                              openEdit(v);
                            }}
                            className="p-1.5 rounded-lg bg-orbit-elevated border border-orbit-border text-orbit-text-secondary hover:text-orbit-primary hover:border-orbit-primary/40 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-orbit-text-secondary disabled:hover:border-orbit-border"
                          >
                            <PencilSquareIcon className="h-4 w-4" />
                          </button>
                          {isVacancyAdmin && (
                            <button
                              type="button"
                              title="Eliminar vacante y requisición"
                              onClick={() => setDeleteTarget(v)}
                              className="p-1.5 rounded-lg bg-orbit-elevated border border-red-200 dark:border-red-500/28 text-red-600 dark:text-red-300 hover:bg-red-50 dark:bg-red-500/12"
                            >
                              <TrashIcon className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {managePanel && (
          <VacancyManageModal
            key={
              managePanel.mode === 'create'
                ? 'create'
                : `edit-${managePanel.vacancy.id}-${managePanel.vacancy.updatedAt ?? ''}`
            }
            mode={managePanel.mode}
            vacancy={managePanel.mode === 'edit' ? managePanel.vacancy : null}
            onClose={() => setManagePanel(null)}
            onSaved={(v, message) => void handleModalSaved(v, message)}
            isVacancyAdmin={isVacancyAdmin}
          />
        )}
      </AnimatePresence>

      <ConfirmTextModal
        open={deleteTarget != null}
        title="Eliminar vacante y requisición"
        description="Se eliminará por completo la vacante y su requisición asociada. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={deleteLoading}
        onClose={() => {
          if (!deleteLoading) setDeleteTarget(null);
        }}
        onConfirm={async (confirmText) => {
          if (!deleteTarget) return;
          setDeleteLoading(true);
          try {
            await deleteVacancy(deleteTarget.id, { confirmText });
            setDeleteTarget(null);
            setSaveBanner('Vacante eliminada.');
            await refresh();
          } catch (e) {
            setLoadError(
              e instanceof Error ? e.message : 'No se pudo eliminar'
            );
          } finally {
            setDeleteLoading(false);
          }
        }}
      />
    </div>
  );
};
