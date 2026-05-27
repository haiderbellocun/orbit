import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  PencilSquareIcon,
  TrashIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { Vacancy, Teacher, Coordinator } from '@/src/types';
import { getVacancies, getStoredCapabilities, deleteVacancy } from '@/src/lib/api';
import {
  computeVacancyActiveDaysFromSent,
  formatVacancyActiveDaysLabel,
  formatVacancyDateOnly,
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

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (v) =>
        v.positionName.toLowerCase().includes(q) ||
        (v.programName ?? '').toLowerCase().includes(q) ||
        (v.areaName ?? '').toLowerCase().includes(q) ||
        (v.schoolName ?? '').toLowerCase().includes(q) ||
        v.id.toLowerCase().includes(q) ||
        (v.reqNumber ?? '').toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

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

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-4 flex-1 min-w-0">
          <div className="glass-panel p-2 flex-1 flex items-center gap-3">
            <MagnifyingGlassIcon className="ml-3 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por cargo, programa, área, REQ..."
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-sm py-2"
            />
          </div>
          <button
            type="button"
            onClick={() => {
              setSaveBanner(null);
              setManagePanel({ mode: 'create' });
            }}
            className="glass-button-primary flex items-center gap-2 px-8 py-3 whitespace-nowrap"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Nueva vacante</span>
          </button>
        </div>
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
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 relative z-10">
          <div className="h-10 w-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-600">Cargando vacantes...</p>
        </div>
      ) : (
        <div className="glass-panel p-0 relative z-10 overflow-x-auto rounded-2xl w-full">
          <table className="w-full min-w-[1080px] text-left text-[15px] table-fixed border-collapse">
            <colgroup>
              <col className="w-[6%]" />
              <col className="w-[13%]" />
              <col className="w-[12%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col className="w-[16%]" />
              <col className="w-[4%]" />
              <col className="w-[12%]" />
              <col className="w-[14%]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-xs uppercase tracking-widest text-slate-500">
                <th className="py-3 px-3 font-bold whitespace-nowrap text-left">Creada</th>
                <th className="py-3 px-3 font-bold text-left leading-tight whitespace-normal">
                  Tiempo activo
                </th>
                <th className="py-3 px-3 font-bold">Área</th>
                <th className="py-3 px-4 font-bold">Escuela</th>
                <th className="py-3 px-4 font-bold">Programa</th>
                <th className="py-3 px-4 font-bold">Cargo</th>
                <th className="py-3 px-4 font-bold text-center">Cant.</th>
                <th className="py-3 px-4 font-bold whitespace-nowrap">Estado</th>
                <th className="py-3 px-4 font-bold text-right whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-slate-500 text-[15px]">
                    No hay vacantes para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-slate-100/80 hover:bg-violet-50/30 transition-colors"
                  >
                    <td className="py-3 px-3 text-slate-600 text-sm whitespace-nowrap align-top">
                      {formatVacancyDateOnly(v.createdAt)}
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
