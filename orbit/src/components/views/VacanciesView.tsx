import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
  BriefcaseIcon,
  QueueListIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { Vacancy, Teacher, Coordinator, VacancyOperationStatus } from '@/src/types';
import { getVacancies, getStoredCapabilities, deleteVacancy } from '@/src/lib/api';
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

type ManagePanel =
  | null
  | { mode: 'create' }
  | { mode: 'edit'; vacancy: Vacancy };

const STATUS_ORDER: VacancyOperationStatus[] = [
  'open',
  'selected',
  'requisition_sent',
  'hired',
  'closed',
  'cancelled',
  'cancelled_by_capital',
];

type VacancyDateField = 'createdAt' | 'sentToCapitalAt';

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
  searchQuery = '',
  setSearchQuery,
  searchResults,
  onOpenVacancyFromNotification,
}) => {
  const [rows, setRows] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);
  const [managePanel, setManagePanel] = useState<ManagePanel>(null);
  const [deleteTarget, setDeleteTarget] = useState<Vacancy | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<VacancyOperationStatus | ''>('');
  const [dateField, setDateField] = useState<VacancyDateField>('createdAt');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('');
  const [programFilter, setProgramFilter] = useState('');
  const isVacancyAdmin = canVacancyAdmin(getStoredCapabilities());

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

  const areaOptions = useMemo(
    () =>
      uniqueSortedOptions(
        rows,
        (v) => v.areaName,
        (v) => String(v.areaId)
      ),
    [rows]
  );

  const schoolOptions = useMemo(
    () =>
      uniqueSortedOptions(
        rows,
        (v) => v.schoolName,
        (v) => String(v.schoolId ?? '')
      ).filter((o) => o.value !== ''),
    [rows]
  );

  const programOptions = useMemo(
    () =>
      uniqueSortedOptions(
        rows,
        (v) => v.programName,
        (v) => String(v.programId ?? '')
      ).filter((o) => o.value !== ''),
    [rows]
  );

  const statusOptions = useMemo(() => {
    const counts = new Map<VacancyOperationStatus, number>();
    for (const v of rows) {
      counts.set(v.operationStatus, (counts.get(v.operationStatus) ?? 0) + 1);
    }
    return STATUS_ORDER.filter((s) => counts.has(s)).map((s) => ({
      status: s,
      count: counts.get(s) ?? 0,
    }));
  }, [rows]);

  useEffect(() => {
    if (!statusFilter) return;
    if (!statusOptions.some((o) => o.status === statusFilter)) {
      setStatusFilter('');
    }
  }, [statusFilter, statusOptions]);

  useEffect(() => {
    if (!areaFilter) return;
    if (!areaOptions.some((o) => o.value === areaFilter)) setAreaFilter('');
  }, [areaFilter, areaOptions]);

  useEffect(() => {
    if (!schoolFilter) return;
    if (!schoolOptions.some((o) => o.value === schoolFilter)) setSchoolFilter('');
  }, [schoolFilter, schoolOptions]);

  useEffect(() => {
    if (!programFilter) return;
    if (!programOptions.some((o) => o.value === programFilter)) setProgramFilter('');
  }, [programFilter, programOptions]);

  const hasActiveFilters =
    statusFilter !== '' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    areaFilter !== '' ||
    schoolFilter !== '' ||
    programFilter !== '' ||
    searchQuery.trim() !== '';

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows.filter((v) => {
      if (statusFilter && v.operationStatus !== statusFilter) return false;
      if (areaFilter && String(v.areaId) !== areaFilter) return false;
      if (schoolFilter && String(v.schoolId ?? '') !== schoolFilter) return false;
      if (programFilter && String(v.programId ?? '') !== programFilter) return false;
      if (!matchesDateRange(v, dateField, dateFrom, dateTo)) return false;
      if (!q) return true;
      return (
        v.positionName.toLowerCase().includes(q) ||
        (v.programName ?? '').toLowerCase().includes(q) ||
        (v.areaName ?? '').toLowerCase().includes(q) ||
        (v.schoolName ?? '').toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q) ||
        (v.reqNumber ?? '').toLowerCase().includes(q)
      );
    });
  }, [
    rows,
    searchQuery,
    statusFilter,
    areaFilter,
    schoolFilter,
    programFilter,
    dateField,
    dateFrom,
    dateTo,
  ]);

  const filteredQuantityTotal = useMemo(
    () => filtered.reduce((sum, v) => sum + (v.quantity ?? 0), 0),
    [filtered]
  );

  const filteredHiredTotal = useMemo(
    () => filtered.reduce((sum, v) => sum + (v.hiredQuantity ?? 0), 0),
    [filtered]
  );

  function resetFilters() {
    setStatusFilter('');
    setDateField('createdAt');
    setDateFrom('');
    setDateTo('');
    setAreaFilter('');
    setSchoolFilter('');
    setProgramFilter('');
    setSearchQuery?.('');
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
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Gestión de Vacantes"
        subtitle="Creación y seguimiento operativo"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 relative z-10">
        <div className="glass-card p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-violet-50/80 text-violet-600 border border-violet-100/80 shadow-inner shrink-0">
            <BriefcaseIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Total solicitado
            </p>
            <p className="text-3xl font-bold text-slate-900 font-display tabular-nums">
              {loading ? '—' : numberFormatter.format(filteredQuantityTotal)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Personas solicitadas en las vacantes visibles.
            </p>
          </div>
        </div>
        <div className="glass-card p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-emerald-50/80 text-emerald-600 border border-emerald-100/80 shadow-inner shrink-0">
            <BriefcaseIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Total contratado
            </p>
            <p className="text-3xl font-bold text-slate-900 font-display tabular-nums">
              {loading ? '—' : numberFormatter.format(filteredHiredTotal)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Personas efectivamente contratadas.
            </p>
          </div>
        </div>
        <div className="glass-card p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-cyan-50/80 text-cyan-600 border border-cyan-100/80 shadow-inner shrink-0">
            <QueueListIcon className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Registros (filas)
            </p>
            <p className="text-3xl font-bold text-slate-900 font-display tabular-nums">
              {loading ? '—' : numberFormatter.format(filtered.length)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {hasActiveFilters
                ? `De ${numberFormatter.format(rows.length)} en total`
                : 'Filas de vacantes visibles'}
            </p>
          </div>
        </div>
      </div>

      <div className="relative z-10 flex flex-col gap-4">
        <div className="glass-panel p-4 flex flex-col gap-3 w-full">
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-end">
            <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest min-w-[180px] flex-1">
              Buscar
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="search"
                  placeholder="Cargo, programa, área, REQ…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery?.(e.target.value)}
                  className="glass-input w-full pl-9 py-2 text-sm font-normal normal-case tracking-normal"
                />
              </div>
            </label>
            {statusOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest min-w-[160px]">
                Estado
                <select
                  className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as VacancyOperationStatus | '')
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
            )}
            {areaOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest min-w-[140px]">
                Área
                <select
                  className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {areaOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {schoolOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest min-w-[140px]">
                Escuela
                <select
                  className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
                  value={schoolFilter}
                  onChange={(e) => setSchoolFilter(e.target.value)}
                >
                  <option value="">Todas</option>
                  {schoolOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="flex flex-col sm:flex-row flex-wrap gap-3 items-end border-t border-slate-100/80 pt-3">
            {programOptions.length > 0 && (
              <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest min-w-[140px]">
                Programa
                <select
                  className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
                  value={programFilter}
                  onChange={(e) => setProgramFilter(e.target.value)}
                >
                  <option value="">Todos</option>
                  {programOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest min-w-[160px]">
              Fecha según
              <select
                className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
                value={dateField}
                onChange={(e) => setDateField(e.target.value as VacancyDateField)}
              >
                <option value="createdAt">Fecha de creación</option>
                <option value="sentToCapitalAt">Envío a capital</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest">
              Desde
              <input
                type="date"
                className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold uppercase text-slate-500 tracking-widest">
              Hasta
              <input
                type="date"
                className="glass-input py-2 text-sm font-normal normal-case tracking-normal"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={resetFilters}
              disabled={loading || !hasActiveFilters}
              className="glass-button-secondary py-2.5 px-5 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Reiniciar filtros
            </button>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              setSaveBanner(null);
              setManagePanel({ mode: 'create' });
            }}
            className="glass-button-primary inline-flex items-center gap-1.5 px-4 py-1.5 text-sm whitespace-nowrap"
          >
            <PlusIcon className="h-4 w-4" />
            <span>Nueva vacante</span>
          </button>
        </div>

        {saveBanner && (
          <div
            role="status"
            className="glass-panel px-4 py-3 text-sm font-medium text-emerald-900 bg-emerald-50/95 border border-emerald-200/80 rounded-2xl shadow-sm"
          >
            {saveBanner}
          </div>
        )}

        {loadError && (
          <div className="glass-panel p-4 text-sm text-rose-700 bg-rose-50/80 border border-rose-100">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 overflow-hidden rounded-2xl w-full">
            <div className="h-10 w-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-slate-600">Cargando vacantes...</p>
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
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs uppercase tracking-widest text-slate-500">
                <th className="py-3 px-3 font-bold whitespace-nowrap text-left"># Requisición</th>
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
                <th className="py-3 px-4 font-bold text-right whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-16 text-center text-slate-500 text-[15px]">
                    No hay vacantes para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-slate-100/80 hover:bg-violet-50/30 transition-colors"
                  >
                    <td className="py-3 px-3 text-slate-700 text-sm align-top">
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
                      className="py-3 px-3 text-slate-700 align-top"
                      title={
                        v.sentToCapitalAt
                          ? vacancyActiveDaysTooltip(v.sentToCapitalAt)
                          : 'SIN FECHA DE ENVÍO'
                      }
                    >
                      <span className="block font-semibold text-violet-700 text-[11px] leading-snug uppercase tracking-wide whitespace-normal break-words">
                        {v.sentToCapitalAt
                          ? formatVacancyActiveDaysLabel(
                              computeVacancyActiveDaysFromSent(v.sentToCapitalAt)
                            )
                          : 'SIN FECHA DE ENVÍO'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-800 align-top">
                      <span className="line-clamp-2" title={v.areaName ?? ''}>
                        {v.areaName ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-800 align-top">
                      <span className="line-clamp-2" title={v.schoolName ?? ''}>
                        {v.schoolName ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-700 align-top">
                      <span className="line-clamp-2" title={v.programName ?? ''}>
                        {v.programName ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-900 align-top">
                      <span className="line-clamp-2" title={v.positionName}>
                        {v.positionName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-center text-slate-800 tabular-nums align-top">
                      {v.quantity}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-800 tabular-nums align-top">
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
                          v.operationStatus === 'open' && 'bg-blue-50 text-blue-700 border-blue-100',
                          v.operationStatus === 'selected' &&
                            'bg-amber-50 text-amber-800 border-amber-100',
                          v.operationStatus === 'requisition_sent' &&
                            'bg-violet-50 text-violet-800 border-violet-100',
                          v.operationStatus === 'hired' &&
                            'bg-emerald-50 text-emerald-800 border-emerald-100',
                          (v.operationStatus === 'closed' ||
                            v.operationStatus === 'cancelled' ||
                            v.operationStatus === 'cancelled_by_capital') &&
                            'bg-slate-100 text-slate-600 border-slate-200'
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
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-violet-600 hover:border-violet-200"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Gestionar vacante y requisición"
                          disabled={!canOpenVacancyManage(v.operationStatus, isVacancyAdmin)}
                          onClick={() => {
                            if (!canOpenVacancyManage(v.operationStatus, isVacancyAdmin)) return;
                            openEdit(v);
                          }}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-violet-600 hover:border-violet-200 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-slate-600 disabled:hover:border-slate-200"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        {isVacancyAdmin && (
                          <button
                            type="button"
                            title="Eliminar vacante y requisición"
                            onClick={() => setDeleteTarget(v)}
                            className="p-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50"
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
