import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PlusIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  EyeIcon,
  PencilSquareIcon,
  DocumentTextIcon,
  XCircleIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { Vacancy, Teacher, Coordinator, VacancyOperationStatus } from '@/src/types';
import {
  getVacancies,
  createVacancy,
  patchVacancy,
  createVacancyRequisition,
  closeVacancy,
  getCatalogAreas,
  getCatalogSchools,
  getCatalogPrograms,
  getCatalogRoles,
  type CatalogArea,
  type CatalogSchool,
  type CatalogProgram,
  type CatalogRole,
  type CreateVacancyPayload,
  type PatchVacancyPayload,
} from '@/src/lib/api';

const STATUS_LABEL: Record<VacancyOperationStatus, string> = {
  open: 'Abierta',
  selected: 'Seleccionado',
  requisition_sent: 'Requisición Enviada',
  hired: 'Contratado',
  closed: 'Cerrada',
  cancelled: 'Cancelada',
};

function isVacancyActionLocked(status: VacancyOperationStatus): boolean {
  return status === 'closed' || status === 'cancelled' || status === 'requisition_sent';
}

function formatDt(iso: string | null | undefined): string {
  if (iso == null || iso === '') return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 19);
  return d.toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

type TriSelectValue = '' | 'true' | 'false';

function triToBool(s: TriSelectValue): boolean | null {
  if (s === 'true') return true;
  if (s === 'false') return false;
  return null;
}

function boolToTri(v: boolean | null | undefined): TriSelectValue {
  if (v === true) return 'true';
  if (v === false) return 'false';
  return '';
}

interface VacanciesViewProps {
  onSelectVacancy: (v: Vacancy) => void;
  /** Called after a successful PATCH so the detail view can show updated notes / feedback. */
  onVacancySaved?: (v: Vacancy) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const VacanciesView: React.FC<VacanciesViewProps> = ({
  onSelectVacancy,
  onVacancySaved,
  searchQuery = '',
  setSearchQuery,
  searchResults,
}) => {
  const [rows, setRows] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saveBanner, setSaveBanner] = useState<string | null>(null);

  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [roles, setRoles] = useState<CatalogRole[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [editRow, setEditRow] = useState<Vacancy | null>(null);
  const [reqRow, setReqRow] = useState<Vacancy | null>(null);
  const [closeRow, setCloseRow] = useState<Vacancy | null>(null);

  const [createAreaId, setCreateAreaId] = useState<number | ''>('');
  const [createSchoolId, setCreateSchoolId] = useState<number | ''>('');
  const [createProgramId, setCreateProgramId] = useState<number | '' | 'none'>('none');
  const [createPosition, setCreatePosition] = useState('');
  const [createLine, setCreateLine] = useState('');
  const [createQty, setCreateQty] = useState('1');
  const [createOpNotes, setCreateOpNotes] = useState('');
  const [createCapNotes, setCreateCapNotes] = useState('');
  const [createTerna, setCreateTerna] = useState<TriSelectValue>('');
  const [createPda, setCreatePda] = useState<TriSelectValue>('');
  const [createContract, setCreateContract] = useState<TriSelectValue>('');
  const [createCv, setCreateCv] = useState<TriSelectValue>('');

  const [reqNumber, setReqNumber] = useState('');
  const [reqSentAt, setReqSentAt] = useState('');

  const [closeStatus, setCloseStatus] = useState<'hired' | 'closed' | 'cancelled'>('closed');

  const refresh = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getVacancies();
      setRows(Array.isArray(res.data) ? res.data : []);
    } catch (e) {
      setRows([]);
      setLoadError(e instanceof Error ? e.message : 'No se pudo cargar');
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

  const loadCatalogs = useCallback(async () => {
    try {
      const [a, r] = await Promise.all([getCatalogAreas(), getCatalogRoles()]);
      setAreas(a);
      setRoles(r);
    } catch {
      /* vacío: catálogo opcional si CORE no está */
    }
  }, []);

  useEffect(() => {
    if (showCreate || editRow) void loadCatalogs();
  }, [showCreate, editRow, loadCatalogs]);

  const onAreaChange = (idNum: number | '') => {
    setCreateAreaId(idNum);
    setCreateSchoolId('');
    setCreateProgramId('none');
    setPrograms([]);
    if (idNum === '') {
      setSchools([]);
      return;
    }
    void getCatalogSchools({ area_id: Number(idNum) }).then(setSchools);
  };

  const onSchoolChange = (idNum: number | '') => {
    setCreateSchoolId(idNum);
    setCreateProgramId('none');
    if (idNum === '') {
      setPrograms([]);
      return;
    }
    void getCatalogPrograms({ school_id: Number(idNum) }).then(setPrograms);
  };

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

  function resetCreateForm() {
    setCreateAreaId('');
    setCreateSchoolId('');
    setCreateProgramId('none');
    setCreatePosition('');
    setCreateLine('');
    setCreateQty('1');
    setCreateOpNotes('');
    setCreateCapNotes('');
    setCreateTerna('');
    setCreatePda('');
    setCreateContract('');
    setCreateCv('');
    setFormError(null);
    setSchools([]);
    setPrograms([]);
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (createAreaId === '' || createSchoolId === '') {
      setFormError('Seleccione área y escuela.');
      return;
    }
    const qty = Number(createQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('La cantidad debe ser mayor a 0.');
      return;
    }
    if (!createPosition.trim()) {
      setFormError('El cargo es obligatorio.');
      return;
    }
    const payload: CreateVacancyPayload = {
      areaId: Number(createAreaId),
      schoolId: Number(createSchoolId),
      programId: createProgramId === 'none' || createProgramId === '' ? null : Number(createProgramId),
      positionName: createPosition.trim(),
      curricularLine: createLine.trim() || null,
      quantity: qty,
      operationNotes: createOpNotes.trim() || null,
      capitalNotes: createCapNotes.trim() || null,
      shortlistComplied: triToBool(createTerna),
      pdaComplied: triToBool(createPda),
      contractConditionsComplied: triToBool(createContract),
      preInterviewCvComplied: triToBool(createCv),
    };
    try {
      await createVacancy(payload);
      setShowCreate(false);
      resetCreateForm();
      await refresh();
      setSaveBanner('Vacante creada correctamente.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al crear');
    }
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!editRow) return;
    setFormError(null);
    const qty = Number(createQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError('La cantidad debe ser mayor a 0.');
      return;
    }
    if (!createPosition.trim()) {
      setFormError('El cargo es obligatorio.');
      return;
    }
    const patch: PatchVacancyPayload = {
      areaId: createAreaId === '' ? undefined : Number(createAreaId),
      schoolId: createSchoolId === '' ? undefined : Number(createSchoolId),
      programId:
        createProgramId === 'none'
          ? null
          : createProgramId === ''
            ? undefined
            : Number(createProgramId),
      positionName: createPosition.trim(),
      curricularLine: createLine.trim() || null,
      quantity: qty,
      operationNotes: createOpNotes.trim() || null,
      capitalNotes: createCapNotes.trim() || null,
      shortlistComplied: triToBool(createTerna),
      pdaComplied: triToBool(createPda),
      contractConditionsComplied: triToBool(createContract),
      preInterviewCvComplied: triToBool(createCv),
      operationStatus: editRow.operationStatus,
    };
    try {
      const apiRow = (await patchVacancy(editRow.id, patch)) as Vacancy;
      const merged: Vacancy = {
        ...editRow,
        ...apiRow,
        areaName: editRow.areaName ?? apiRow.areaName,
        schoolName: editRow.schoolName ?? apiRow.schoolName,
        programName: editRow.programName ?? apiRow.programName,
        reqNumber: editRow.reqNumber ?? apiRow.reqNumber,
      };
      onVacancySaved?.(merged);
      setEditRow(null);
      resetCreateForm();
      await refresh();
      setSaveBanner(
        'Cambios guardados (observaciones, cumplimientos y demás campos).'
      );
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    }
  }

  async function handleRequisitionSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reqRow) return;
    setFormError(null);
    if (!reqNumber.trim()) {
      setFormError('El número REQ es obligatorio.');
      return;
    }
    try {
      await createVacancyRequisition(reqRow.id, {
        reqNumber: reqNumber.trim(),
        sentToCapitalAt: reqSentAt.trim()
          ? new Date(reqSentAt).toISOString()
          : null,
      });
      setReqRow(null);
      setReqNumber('');
      setReqSentAt('');
      await refresh();
      setSaveBanner('Requisición registrada.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al crear requisición');
    }
  }

  async function handleCloseSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!closeRow) return;
    setFormError(null);
    try {
      await closeVacancy(closeRow.id, { operationStatus: closeStatus });
      setCloseRow(null);
      await refresh();
      setSaveBanner('Vacante cerrada.');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al cerrar');
    }
  }

  function openEdit(v: Vacancy) {
    setFormError(null);
    setSaveBanner(null);
    setEditRow(v);
    setCreateAreaId(v.areaId);
    setCreateSchoolId(v.schoolId);
    setCreateProgramId(v.programId == null ? 'none' : v.programId);
    setCreatePosition(v.positionName);
    setCreateLine(v.curricularLine ?? '');
    setCreateQty(String(v.quantity));
    setCreateOpNotes(v.operationNotes ?? '');
    setCreateCapNotes(v.capitalNotes ?? '');
    setCreateTerna(boolToTri(v.shortlistComplied));
    setCreatePda(boolToTri(v.pdaComplied));
    setCreateContract(boolToTri(v.contractConditionsComplied));
    setCreateCv(boolToTri(v.preInterviewCvComplied));
    void getCatalogSchools({ area_id: v.areaId }).then(setSchools);
    void getCatalogPrograms({ school_id: v.schoolId }).then(setPrograms);
  };

  return (
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Gestión de Vacantes"
        subtitle="Creación y seguimiento operativo"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-4 flex-1 lg:max-w-2xl">
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
              resetCreateForm();
              setShowCreate(true);
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
        <div className="glass-panel p-0 sm:p-1 relative z-10 overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[720px] text-left text-sm table-fixed">
            <colgroup>
              <col className="w-[140px]" />
              <col />
              <col />
              <col />
              <col />
              <col className="w-14" />
              <col className="w-[130px]" />
              <col className="w-[148px]" />
            </colgroup>
            <thead>
              <tr className="border-b border-slate-200/80 bg-slate-50/80 text-[10px] uppercase tracking-widest text-slate-500">
                <th className="py-3 px-3 font-bold whitespace-nowrap text-left">Fecha</th>
                <th className="py-3 px-3 font-bold">Área</th>
                <th className="py-3 px-3 font-bold">Escuela</th>
                <th className="py-3 px-3 font-bold">Programa</th>
                <th className="py-3 px-3 font-bold">Cargo</th>
                <th className="py-3 px-3 font-bold text-center">Cant.</th>
                <th className="py-3 px-3 font-bold whitespace-nowrap">Estado</th>
                <th className="py-3 px-3 font-bold text-right whitespace-nowrap">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-slate-500 text-sm">
                    No hay vacantes para mostrar.
                  </td>
                </tr>
              ) : (
                filtered.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-slate-100/80 hover:bg-violet-50/30 transition-colors"
                  >
                    <td className="py-3 px-3 text-slate-600 text-xs whitespace-nowrap align-top">
                      {formatDt(v.createdAt)}
                    </td>
                    <td className="py-3 px-3 text-slate-800 align-top">
                      <span className="line-clamp-2" title={v.areaName ?? ''}>
                        {v.areaName ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-800 align-top">
                      <span className="line-clamp-2" title={v.schoolName ?? ''}>
                        {v.schoolName ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-slate-700 align-top">
                      <span className="line-clamp-2" title={v.programName ?? ''}>
                        {v.programName ?? '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900 align-top">
                      <span className="line-clamp-2" title={v.positionName}>
                        {v.positionName}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-center text-slate-800 tabular-nums align-top">
                      {v.quantity}
                    </td>
                    <td className="py-3 px-3 align-top">
                      <span
                        className={cn(
                          'inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold border',
                          v.operationStatus === 'open' && 'bg-blue-50 text-blue-700 border-blue-100',
                          v.operationStatus === 'selected' &&
                            'bg-amber-50 text-amber-800 border-amber-100',
                          v.operationStatus === 'requisition_sent' &&
                            'bg-violet-50 text-violet-800 border-violet-100',
                          v.operationStatus === 'hired' &&
                            'bg-emerald-50 text-emerald-800 border-emerald-100',
                          (v.operationStatus === 'closed' ||
                            v.operationStatus === 'cancelled') &&
                            'bg-slate-100 text-slate-600 border-slate-200'
                        )}
                      >
                        {STATUS_LABEL[v.operationStatus]}
                      </span>
                    </td>
                    <td className="py-3 px-3 align-top">
                      <div className="flex flex-wrap gap-1">
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
                          title="Editar"
                          disabled={isVacancyActionLocked(v.operationStatus)}
                          onClick={() => {
                            if (isVacancyActionLocked(v.operationStatus)) return;
                            openEdit(v);
                          }}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-violet-600 hover:border-violet-200 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-slate-600 disabled:hover:border-slate-200"
                        >
                          <PencilSquareIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Convertir en requisición"
                          disabled={Boolean(v.reqNumber)}
                          onClick={() => {
                            setFormError(null);
                            setReqRow(v);
                            setReqNumber('');
                            setReqSentAt('');
                          }}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-violet-600 hover:border-violet-200 disabled:opacity-35"
                        >
                          <DocumentTextIcon className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Cerrar vacante"
                          disabled={isVacancyActionLocked(v.operationStatus)}
                          onClick={() => {
                            if (isVacancyActionLocked(v.operationStatus)) return;
                            setFormError(null);
                            setCloseRow(v);
                            setCloseStatus('closed');
                          }}
                          className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-600 hover:text-rose-600 hover:border-rose-200 disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:text-slate-600 disabled:hover:border-slate-200"
                        >
                          <XCircleIcon className="h-4 w-4" />
                        </button>
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
        {(showCreate || editRow) && (
          <ModalShell
            title={editRow ? 'Editar vacante' : 'Nueva vacante'}
            panelMaxClassName="max-w-4xl"
            onClose={() => {
              setShowCreate(false);
              setEditRow(null);
              resetCreateForm();
            }}
          >
            {formError && (
              <p className="text-sm text-rose-600 mb-4">{formError}</p>
            )}
            <form
              onSubmit={editRow ? handleEditSubmit : handleCreate}
              className="space-y-4 max-h-[min(82vh,calc(90vh-7rem))] overflow-y-auto overflow-x-visible pr-1 min-w-0"
            >
              <div className="grid grid-cols-1 gap-4">
                <Field label="Área *">
                  <select
                    required
                    className="glass-input py-2.5 text-sm w-full min-w-0 max-w-full"
                    value={createAreaId === '' ? '' : String(createAreaId)}
                    onChange={(e) =>
                      onAreaChange(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">Seleccione...</option>
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Escuela *">
                  <select
                    required
                    className="glass-input py-2.5 text-sm w-full min-w-0 max-w-full"
                    value={createSchoolId === '' ? '' : String(createSchoolId)}
                    onChange={(e) =>
                      onSchoolChange(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">
                      {createAreaId === '' ? 'Primero elija área' : 'Seleccione...'}
                    </option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Programa (opcional)">
                <select
                  className="glass-input py-2.5 text-sm w-full min-w-0 max-w-full"
                  value={
                    createProgramId === 'none' || createProgramId === ''
                      ? 'none'
                      : String(createProgramId)
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setCreateProgramId(val === 'none' ? 'none' : Number(val));
                  }}
                >
                  <option value="none">Sin programa</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Cargo *">
                <input
                  required
                  list="role-names"
                  className="glass-input py-2.5 text-sm w-full"
                  value={createPosition}
                  onChange={(e) => setCreatePosition(e.target.value)}
                  placeholder="Nombre del cargo o elija de lista"
                />
                <datalist id="role-names">
                  {roles.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Línea curricular / área">
                <input
                  className="glass-input py-2.5 text-sm w-full"
                  value={createLine}
                  onChange={(e) => setCreateLine(e.target.value)}
                />
              </Field>
              <Field label="Cantidad *">
                <input
                  required
                  type="number"
                  min={1}
                  className="glass-input py-2.5 text-sm w-full"
                  value={createQty}
                  onChange={(e) => setCreateQty(e.target.value)}
                />
              </Field>
              <Field label="Observaciones operación">
                <textarea
                  className="glass-input py-2.5 text-sm w-full min-h-[72px]"
                  value={createOpNotes}
                  onChange={(e) => setCreateOpNotes(e.target.value)}
                />
              </Field>
              <Field label="Observaciones capital humano">
                <textarea
                  className="glass-input py-2.5 text-sm w-full min-h-[56px]"
                  value={createCapNotes}
                  onChange={(e) => setCreateCapNotes(e.target.value)}
                />
              </Field>
              {editRow && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Estado operación">
                    <select
                      className="glass-input py-2.5 text-sm w-full min-w-0 max-w-full"
                      value={editRow.operationStatus}
                      onChange={(e) => {
                        const st = e.target.value as VacancyOperationStatus;
                        setEditRow({ ...editRow, operationStatus: st });
                      }}
                    >
                      {(Object.keys(STATUS_LABEL) as VacancyOperationStatus[]).map(
                        (k) => (
                          <option key={k} value={k}>
                            {STATUS_LABEL[k]}
                          </option>
                        )
                      )}
                    </select>
                  </Field>
                </div>
              )}
              {!editRow && (
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  Al crear, el estado queda <strong>Abierta</strong>. REQ y fechas no se
                  capturan aquí.
                </p>
              )}
              {editRow && (
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  Use &quot;Guardar cambios&quot; para aplicar el estado operación seleccionado.
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <TriField label="Terna" value={createTerna} onChange={setCreateTerna} />
                <TriField label="PDA" value={createPda} onChange={setCreatePda} />
                <TriField
                  label="Condiciones contractuales"
                  value={createContract}
                  onChange={setCreateContract}
                />
                <TriField
                  label="Hojas de vida pre-entrevista"
                  value={createCv}
                  onChange={setCreateCv}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 glass-button-primary py-3 text-xs font-bold uppercase tracking-widest">
                  {editRow ? 'Guardar cambios' : 'Crear vacante'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreate(false);
                    setEditRow(null);
                    resetCreateForm();
                  }}
                  className="flex-1 glass-button-secondary py-3 text-xs font-bold uppercase tracking-widest"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {reqRow && (
          <ModalShell
            title="Convertir en requisición"
            onClose={() => {
              setReqRow(null);
              setReqNumber('');
              setReqSentAt('');
              setFormError(null);
            }}
          >
            {formError && (
              <p className="text-sm text-rose-600 mb-4">{formError}</p>
            )}
            <p className="text-sm text-slate-600 mb-4">
              Vacante: <strong>{reqRow.positionName}</strong> ({reqRow.schoolName})
            </p>
            <form onSubmit={handleRequisitionSubmit} className="space-y-4">
              <Field label="Número REQ *">
                <input
                  required
                  className="glass-input py-2.5 text-sm w-full font-mono"
                  value={reqNumber}
                  onChange={(e) => setReqNumber(e.target.value)}
                  placeholder="REQ-2026-001"
                />
              </Field>
              <Field label="Enviado a capital (opcional, ISO)">
                <input
                  type="datetime-local"
                  className="glass-input py-2.5 text-sm w-full"
                  value={reqSentAt}
                  onChange={(e) => setReqSentAt(e.target.value)}
                />
              </Field>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 glass-button-primary py-3 text-xs font-bold uppercase tracking-widest">
                  Registrar requisición
                </button>
                <button
                  type="button"
                  onClick={() => setReqRow(null)}
                  className="flex-1 glass-button-secondary py-3 text-xs font-bold uppercase tracking-widest"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {closeRow && (
          <ModalShell
            title="Cerrar vacante"
            onClose={() => {
              setCloseRow(null);
              setFormError(null);
            }}
          >
            {formError && (
              <p className="text-sm text-rose-600 mb-4">{formError}</p>
            )}
            <p className="text-sm text-slate-600 mb-4">
              {closeRow.positionName} — se guardará <code className="text-xs bg-slate-100 px-1 rounded">closed_at</code>{' '}
              en este momento.
            </p>
            <form onSubmit={handleCloseSubmit} className="space-y-4">
              <Field label="Estado final">
                <select
                  className="glass-input py-2.5 text-sm w-full"
                  value={closeStatus}
                  onChange={(e) =>
                    setCloseStatus(e.target.value as typeof closeStatus)
                  }
                >
                  <option value="hired">Contratado</option>
                  <option value="closed">Cerrada</option>
                  <option value="cancelled">Cancelada</option>
                </select>
              </Field>
              <div className="flex gap-3">
                <button type="submit" className="flex-1 glass-button-primary py-3 text-xs font-bold uppercase tracking-widest">
                  Confirmar cierre
                </button>
                <button
                  type="button"
                  onClick={() => setCloseRow(null)}
                  className="flex-1 glass-button-secondary py-3 text-xs font-bold uppercase tracking-widest"
                >
                  Volver
                </button>
              </div>
            </form>
          </ModalShell>
        )}
      </AnimatePresence>
    </div>
  );
};

function ModalShell({
  title,
  children,
  onClose,
  panelMaxClassName = 'max-w-lg',
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** Tailwind max-width for the panel (e.g. max-w-4xl for wide forms). */
  panelMaxClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        className={cn(
          'w-full glass-panel p-6 sm:p-8 relative z-10 shadow-2xl max-h-[92vh] overflow-hidden flex flex-col min-w-0',
          panelMaxClassName,
        )}
      >
        <div className="flex justify-between items-start mb-6 gap-4">
          <h2 className="text-xl font-bold text-slate-900 font-display">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 shrink-0"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">
        {label}
      </label>
      {children}
    </div>
  );
}

function TriField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: TriSelectValue;
  onChange: (v: TriSelectValue) => void;
}) {
  return (
    <Field label={label}>
      <select
        className="glass-input py-2.5 text-sm w-full min-w-0 max-w-full"
        value={value}
        onChange={(e) => onChange(e.target.value as TriSelectValue)}
      >
        <option value="">Pendiente</option>
        <option value="true">Sí cumplió</option>
        <option value="false">No cumplió</option>
      </select>
    </Field>
  );
}
