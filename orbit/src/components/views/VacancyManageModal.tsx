import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  XMarkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import { toUpperAscii, toUpperAsciiOrNull } from '@/src/lib/textNormalize';
import type { Vacancy, VacancyOperationStatus } from '@/src/types';
import {
  createVacancy,
  patchVacancy,
  createVacancyRequisition,
  patchVacancyRequisition,
  appendVacancyOperationNote,
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
import { dateInputToIso, isoToDateInputValue } from '@/src/lib/vacancyActiveDays';
import {
  ZOHO_REQUISITION_FORM_URL,
  STATUS_LABEL,
  isVacancyCoreFieldsLocked,
  triToBool,
  boolToTri,
  triLabel,
  hasRequisitionDraft,
  formatVacancyDt,
  type TriSelectValue,
} from '@/src/lib/vacancyFormHelpers';

type ManageTab = 'vacancy' | 'requisition' | 'status';
type Step = 'form' | 'summary';

export interface VacancyManageModalProps {
  mode: 'create' | 'edit';
  vacancy: Vacancy | null;
  onClose: () => void;
  onSaved: (vacancy: Vacancy, bannerMessage: string) => void;
}

export const VacancyManageModal: React.FC<VacancyManageModalProps> = ({
  mode,
  vacancy,
  onClose,
  onSaved,
}) => {
  const [step, setStep] = useState<Step>('form');
  const [activeTab, setActiveTab] = useState<ManageTab>('vacancy');
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [roles, setRoles] = useState<CatalogRole[]>([]);

  const [areaId, setAreaId] = useState<number | ''>('');
  const [schoolId, setSchoolId] = useState<number | ''>('');
  const [programId, setProgramId] = useState<number | '' | 'none'>('none');
  const [position, setPosition] = useState('');
  const [line, setLine] = useState('');
  const [directManagerCc, setDirectManagerCc] = useState('');
  const [qty, setQty] = useState('1');
  const [initialOpNotes, setInitialOpNotes] = useState('');
  const [operationStatus, setOperationStatus] = useState<VacancyOperationStatus>('open');
  const [newOpNoteDraft, setNewOpNoteDraft] = useState('');
  const [opNoteSaving, setOpNoteSaving] = useState(false);
  const [operationNotes, setOperationNotes] = useState<Vacancy['operationNotes']>([]);

  const [reqNumber, setReqNumber] = useState('');
  const [reqSentAt, setReqSentAt] = useState('');
  const [reqCapNotes, setReqCapNotes] = useState('');
  const [terna, setTerna] = useState<TriSelectValue>('');
  const [pda, setPda] = useState<TriSelectValue>('');
  const [contract, setContract] = useState<TriSelectValue>('');
  const [cv, setCv] = useState<TriSelectValue>('');

  const editVacancy = vacancy;
  const coreLocked = editVacancy != null && isVacancyCoreFieldsLocked(editVacancy);
  const ccLocked =
    editVacancy != null && Boolean((editVacancy.directManagerIdentification ?? '').trim());
  const hasExistingReq = Boolean(editVacancy?.reqAssignedAt);

  const initFromVacancy = useCallback((v: Vacancy) => {
    setAreaId(v.areaId);
    setSchoolId(v.schoolId == null ? '' : v.schoolId);
    setProgramId(v.programId == null ? 'none' : v.programId);
    setPosition(v.positionName);
    setLine(v.curricularLine ?? '');
    setDirectManagerCc(v.directManagerIdentification ?? '');
    setQty(String(v.quantity));
    setInitialOpNotes('');
    setOperationStatus(v.operationStatus);
    setOperationNotes(v.operationNotes ?? []);
    setReqNumber(v.reqNumber ?? '');
    setReqSentAt(isoToDateInputValue(v.sentToCapitalAt));
    setReqCapNotes(v.capitalNotes ?? '');
    setTerna(boolToTri(v.shortlistComplied));
    setPda(boolToTri(v.pdaComplied));
    setContract(boolToTri(v.contractConditionsComplied));
    setCv(boolToTri(v.preInterviewCvComplied));
    void getCatalogSchools({ area_id: v.areaId }).then(setSchools);
    void (v.schoolId != null
      ? getCatalogPrograms({ school_id: v.schoolId })
      : Promise.resolve([])
    ).then(setPrograms);
  }, []);

  const resetCreate = useCallback(() => {
    setAreaId('');
    setSchoolId('');
    setProgramId('none');
    setPosition('');
    setLine('');
    setDirectManagerCc('');
    setQty('1');
    setInitialOpNotes('');
    setOperationStatus('open');
    setOperationNotes([]);
    setReqNumber('');
    setReqSentAt('');
    setReqCapNotes('');
    setTerna('');
    setPda('');
    setContract('');
    setCv('');
    setSchools([]);
    setPrograms([]);
  }, []);

  useEffect(() => {
    setStep('form');
    setActiveTab('vacancy');
    setFormError(null);
    if (mode === 'edit' && vacancy) {
      initFromVacancy(vacancy);
    } else {
      resetCreate();
    }
  }, [mode, vacancy, initFromVacancy, resetCreate]);

  useEffect(() => {
    void (async () => {
      try {
        const [a, r] = await Promise.all([getCatalogAreas(), getCatalogRoles()]);
        setAreas(a);
        setRoles(r);
      } catch {
        /* catálogo opcional */
      }
    })();
  }, []);

  const onAreaChange = (idNum: number | '') => {
    setAreaId(idNum);
    setSchoolId('');
    setProgramId('none');
    setPrograms([]);
    if (idNum === '') {
      setSchools([]);
      return;
    }
    void getCatalogSchools({ area_id: Number(idNum) }).then(setSchools);
  };

  const onSchoolChange = (idNum: number | '') => {
    setSchoolId(idNum);
    setProgramId('none');
    if (idNum === '') {
      setPrograms([]);
      return;
    }
    void getCatalogPrograms({ school_id: Number(idNum) }).then(setPrograms);
  };

  const reqDraft = hasRequisitionDraft(
    reqNumber,
    reqSentAt,
    reqCapNotes,
    terna,
    pda,
    contract,
    cv
  );

  const areaName = useMemo(
    () => areas.find((a) => a.id === areaId)?.name ?? editVacancy?.areaName ?? '—',
    [areas, areaId, editVacancy?.areaName]
  );
  const schoolName = useMemo(
    () =>
      schoolId === ''
        ? editVacancy?.schoolName ?? 'Sin escuela'
        : schools.find((s) => s.id === schoolId)?.name ?? editVacancy?.schoolName ?? '—',
    [schools, schoolId, editVacancy?.schoolName]
  );
  const programName = useMemo(() => {
    if (programId === 'none' || programId === '') return 'Sin programa';
    return (
      programs.find((p) => p.id === programId)?.name ??
      editVacancy?.programName ??
      '—'
    );
  }, [programs, programId, editVacancy?.programName]);

  function validateForm(): string | null {
    if (mode === 'create' || !coreLocked) {
      if (areaId === '') return 'Seleccione área.';
      if (!position.trim()) return 'El cargo es obligatorio.';
      const n = Number(qty);
      if (!Number.isFinite(n) || n <= 0) return 'La cantidad debe ser mayor a 0.';
    }
    return null;
  }

  function buildRequisitionBody() {
    return {
      reqNumber: reqNumber.trim() ? toUpperAscii(reqNumber) : null,
      sentToCapitalAt: dateInputToIso(reqSentAt),
      capitalNotes: reqCapNotes.trim() ? toUpperAscii(reqCapNotes) : null,
      shortlistComplied: triToBool(terna),
      pdaComplied: triToBool(pda),
      contractConditionsComplied: triToBool(contract),
      preInterviewCvComplied: triToBool(cv),
    };
  }

  function hasVacancyPatchChanges(): boolean {
    if (mode === 'create') return true;
    if (!editVacancy) return false;
    if (coreLocked) {
      return (
        operationStatus !== editVacancy.operationStatus ||
        (!ccLocked && directManagerCc.trim() !== (editVacancy.directManagerIdentification ?? '').trim())
      );
    }
    const ccTrim = directManagerCc.trim();
    const prevCc = (editVacancy.directManagerIdentification ?? '').trim();
    return (
      areaId !== editVacancy.areaId ||
      (schoolId === '' ? null : Number(schoolId)) !== editVacancy.schoolId ||
      (programId === 'none' ? null : Number(programId)) !== editVacancy.programId ||
      position.trim().toUpperCase() !== editVacancy.positionName.toUpperCase() ||
      (line.trim() ? toUpperAscii(line) : null) !==
        (editVacancy.curricularLine?.trim() ? editVacancy.curricularLine : null) ||
      Number(qty) !== editVacancy.quantity ||
      operationStatus !== editVacancy.operationStatus ||
      (!ccLocked && ccTrim !== prevCc)
    );
  }

  function buildVacancyPatch(): PatchVacancyPayload {
    if (!editVacancy) return {};
    const ccTrim = directManagerCc.trim();
    if (coreLocked) {
      return {
        operationStatus,
        ...(!ccLocked && ccTrim ? { directManagerIdentification: ccTrim } : {}),
      };
    }
    return {
      areaId: areaId === '' ? undefined : Number(areaId),
      schoolId: schoolId === '' ? null : Number(schoolId),
      programId: programId === 'none' ? null : Number(programId),
      positionName: toUpperAscii(position),
      curricularLine: toUpperAsciiOrNull(line),
      quantity: Number(qty),
      operationStatus,
      ...(!ccLocked && ccTrim ? { directManagerIdentification: ccTrim } : {}),
    };
  }

  function hasRequisitionPatchChanges(): boolean {
    if (!editVacancy?.reqAssignedAt) return reqDraft;
    const normCap = (s: string) => {
      const t = s.trim();
      return t === '' ? null : toUpperAscii(t);
    };
    const nextCap = normCap(reqCapNotes);
    const prevCap = normCap(editVacancy.capitalNotes ?? '');
    const nextReq = reqNumber.trim() ? toUpperAscii(reqNumber) : null;
    const prevReq =
      editVacancy.reqNumber != null && editVacancy.reqNumber !== ''
        ? editVacancy.reqNumber
        : null;
    const nextSent = dateInputToIso(reqSentAt);
    const prevSent = editVacancy.sentToCapitalAt ?? null;
    return (
      nextReq !== prevReq ||
      nextCap !== prevCap ||
      nextSent !== prevSent ||
      triToBool(terna) !== editVacancy.shortlistComplied ||
      triToBool(pda) !== editVacancy.pdaComplied ||
      triToBool(contract) !== editVacancy.contractConditionsComplied ||
      triToBool(cv) !== editVacancy.preInterviewCvComplied
    );
  }

  function buildRequisitionPatch(): Parameters<typeof patchVacancyRequisition>[1] {
    if (!editVacancy) return {};
    const normCap = (s: string) => {
      const t = s.trim();
      return t === '' ? null : toUpperAscii(t);
    };
    const nextCap = normCap(reqCapNotes);
    const prevCap = normCap(editVacancy.capitalNotes ?? '');
    const nextReq = reqNumber.trim() ? toUpperAscii(reqNumber) : null;
    const prevReq =
      editVacancy.reqNumber != null && editVacancy.reqNumber !== ''
        ? editVacancy.reqNumber
        : null;
    const nextSent = dateInputToIso(reqSentAt);
    const prevSent = editVacancy.sentToCapitalAt ?? null;
    const patch: Parameters<typeof patchVacancyRequisition>[1] = {
      shortlistComplied: triToBool(terna),
      pdaComplied: triToBool(pda),
      contractConditionsComplied: triToBool(contract),
      preInterviewCvComplied: triToBool(cv),
    };
    if (nextReq !== prevReq) patch.reqNumber = nextReq;
    if (nextCap !== prevCap) patch.capitalNotes = nextCap;
    if (nextSent !== prevSent) patch.sentToCapitalAt = nextSent;
    return patch;
  }

  function goToSummary() {
    const err = validateForm();
    if (err) {
      setFormError(err);
      return;
    }
    if (
      mode === 'edit' &&
      !hasVacancyPatchChanges() &&
      !hasRequisitionPatchChanges() &&
      !(reqDraft && !hasExistingReq)
    ) {
      setFormError('No hay cambios para guardar. Revise las pestañas o active el cierre.');
      return;
    }
    setFormError(null);
    setStep('summary');
  }

  async function handleAppendOperationNote() {
    if (!editVacancy) return;
    const text = newOpNoteDraft.trim();
    if (text === '') {
      setFormError('Escriba un comentario para añadir.');
      return;
    }
    setFormError(null);
    setOpNoteSaving(true);
    try {
      const { note } = await appendVacancyOperationNote(editVacancy.id, {
        text: toUpperAscii(text),
      });
      setOperationNotes((prev) => [...prev, note]);
      setNewOpNoteDraft('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al añadir comentario');
    } finally {
      setOpNoteSaving(false);
    }
  }

  async function handleConfirm() {
    setFormError(null);
    setSaving(true);
    try {
      let result: Vacancy | null = null;
      const messages: string[] = [];

      if (mode === 'create') {
        const ccTrim = directManagerCc.trim();
        const payload: CreateVacancyPayload = {
          areaId: Number(areaId),
          schoolId: schoolId === '' ? null : Number(schoolId),
          programId: programId === 'none' || programId === '' ? null : Number(programId),
          positionName: toUpperAscii(position),
          curricularLine: toUpperAsciiOrNull(line),
          quantity: Number(qty),
          operationNotes: initialOpNotes.trim() ? toUpperAscii(initialOpNotes) : null,
          ...(ccTrim ? { directManagerIdentification: ccTrim } : {}),
        };
        result = await createVacancy(payload);
        messages.push('Vacante creada');
        if (reqDraft) {
          result = await createVacancyRequisition(result.id, buildRequisitionBody());
          messages.push('requisición registrada');
        }
      } else if (editVacancy) {
        let id = editVacancy.id;
        if (hasVacancyPatchChanges()) {
          result = (await patchVacancy(id, buildVacancyPatch())) as Vacancy;
          messages.push(coreLocked ? 'Estado actualizado' : 'Vacante actualizada');
        }
        if (!hasExistingReq && reqDraft) {
          result = await createVacancyRequisition(id, buildRequisitionBody());
          messages.push('Requisición registrada');
        } else if (hasExistingReq && hasRequisitionPatchChanges()) {
          result = await patchVacancyRequisition(id, buildRequisitionPatch());
          messages.push('Requisición actualizada');
        }
        result = result ?? editVacancy;
      }

      if (result) {
        onSaved(result, messages.join('. ') + '.');
        onClose();
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  const tabs = useMemo(() => {
    const base: { id: ManageTab; label: string }[] = [
      { id: 'vacancy', label: 'Vacante' },
      { id: 'requisition', label: 'Requisición' },
    ];
    if (mode === 'edit') base.push({ id: 'status', label: 'Estado' });
    return base;
  }, [mode]);

  const title =
    step === 'summary'
      ? 'Resumen antes de guardar'
      : mode === 'create'
        ? 'Nueva vacante'
        : 'Gestionar vacante';

  const showVacancySummary = mode === 'create' || hasVacancyPatchChanges();
  const showRequisitionSummary =
    mode === 'create' ? reqDraft : reqDraft || (hasExistingReq && hasRequisitionPatchChanges());

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
        className="w-full max-w-4xl glass-panel p-6 sm:p-8 relative z-10 shadow-2xl max-h-[92vh] overflow-hidden flex flex-col min-w-0"
      >
        <div className="flex justify-between items-start mb-4 gap-4 shrink-0">
          <h2 className="text-xl font-bold text-slate-900 font-display">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl text-slate-400 shrink-0"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {step === 'form' && (
          <div className="mb-4 flex flex-wrap items-center gap-2 shrink-0">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={cn(
                  'rounded-xl border px-4 py-2 text-xs font-bold uppercase tracking-widest transition-all',
                  activeTab === t.id
                    ? 'border-violet-600 bg-violet-600 text-white shadow-sm'
                    : 'border-white/30 bg-white/40 text-slate-600 hover:bg-white/60'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {formError && (
          <p className="text-sm text-rose-600 mb-3 shrink-0">{formError}</p>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-visible pr-1 min-h-0 min-w-0">
          {step === 'summary' ? (
            <div className="space-y-5">
              {showVacancySummary && (
                <SummarySection title="Vacante">
                  <SummaryRow label="Área" value={areaName} />
                  <SummaryRow label="Escuela" value={schoolName} />
                  <SummaryRow label="Programa" value={programName} />
                  <SummaryRow label="Cargo" value={position.trim() || '—'} />
                  <SummaryRow label="Línea curricular" value={line.trim() || '—'} />
                  <SummaryRow label="Cantidad" value={qty} />
                  <SummaryRow
                    label="Jefe inmediato"
                    value={directManagerCc.trim() || '—'}
                  />
                  {mode === 'edit' && (
                    <SummaryRow
                      label="Estado operación"
                      value={STATUS_LABEL[operationStatus]}
                    />
                  )}
                  {mode === 'create' && initialOpNotes.trim() && (
                    <SummaryRow label="Comentario inicial" value={initialOpNotes.trim()} />
                  )}
                </SummarySection>
              )}

              {showRequisitionSummary && (
                <SummarySection title="Requisición">
                  <SummaryRow
                    label="Número REQ"
                    value={reqNumber.trim() || '—'}
                  />
                  <SummaryRow
                    label="Enviado a capital"
                    value={reqSentAt || '—'}
                  />
                  <SummaryRow
                    label="Notas capital humano"
                    value={reqCapNotes.trim() || '—'}
                  />
                  <SummaryRow label="Terna" value={triLabel(terna)} />
                  <SummaryRow label="PDA" value={triLabel(pda)} />
                  <SummaryRow
                    label="Condiciones contractuales"
                    value={triLabel(contract)}
                  />
                  <SummaryRow
                    label="Hojas de vida pre-entrevista"
                    value={triLabel(cv)}
                  />
                </SummarySection>
              )}
            </div>
          ) : activeTab === 'vacancy' ? (
            <div className="space-y-4">
              {coreLocked && editVacancy && (
                <p className="text-sm text-violet-900 bg-violet-50/95 border border-violet-200/80 rounded-xl px-4 py-3">
                  Esta vacante ya tiene requisición (
                  <strong>{editVacancy.reqNumber ?? 'sin número'}</strong>). Los datos base
                  están bloqueados; puede cambiar estado, comentarios y la pestaña Requisición.
                </p>
              )}
              <div className="grid grid-cols-1 gap-4">
                <Field label="Área *">
                  <select
                    required
                    disabled={mode === 'edit' && coreLocked}
                    className="glass-input py-2.5 text-sm w-full min-w-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    value={areaId === '' ? '' : String(areaId)}
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
                <Field label="Escuela (opcional)">
                  <select
                    disabled={mode === 'edit' && coreLocked}
                    className="glass-input py-2.5 text-sm w-full min-w-0 disabled:opacity-60 disabled:cursor-not-allowed"
                    value={schoolId === '' ? '' : String(schoolId)}
                    onChange={(e) =>
                      onSchoolChange(e.target.value ? Number(e.target.value) : '')
                    }
                  >
                    <option value="">
                      {areaId === '' ? 'Primero elija área' : 'Sin escuela / elegir…'}
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
                  disabled={mode === 'edit' && coreLocked}
                  className="glass-input py-2.5 text-sm w-full min-w-0 disabled:opacity-60 disabled:cursor-not-allowed"
                  value={
                    programId === 'none' || programId === '' ? 'none' : String(programId)
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setProgramId(val === 'none' ? 'none' : Number(val));
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
                  disabled={mode === 'edit' && coreLocked}
                  list="vacancy-role-names"
                  className="glass-input py-2.5 text-sm w-full disabled:opacity-60 disabled:cursor-not-allowed"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  placeholder="Nombre del cargo o elija de lista"
                />
                <datalist id="vacancy-role-names">
                  {roles.map((r) => (
                    <option key={r.id} value={r.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="Línea curricular / área">
                <input
                  disabled={mode === 'edit' && coreLocked}
                  className="glass-input py-2.5 text-sm w-full disabled:opacity-60 disabled:cursor-not-allowed"
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                />
              </Field>
              <Field label="Cantidad *">
                <input
                  required
                  type="number"
                  min={1}
                  disabled={mode === 'edit' && coreLocked}
                  className="glass-input py-2.5 text-sm w-full disabled:opacity-60 disabled:cursor-not-allowed"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                />
              </Field>
              <Field label="Nombre jefe inmediato (opcional)">
                <input
                  type="text"
                  maxLength={200}
                  disabled={mode === 'edit' && ccLocked}
                  className="glass-input py-2.5 text-sm w-full disabled:opacity-60 disabled:cursor-not-allowed"
                  value={directManagerCc}
                  onChange={(e) => setDirectManagerCc(e.target.value)}
                  placeholder="Nombre completo"
                />
                {ccLocked && (
                  <p className="text-xs text-slate-500 mt-1">
                    El nombre del jefe inmediato no puede modificarse una vez registrado.
                  </p>
                )}
              </Field>
              {mode === 'create' && (
                <Field label="Comentario inicial de operación (opcional)">
                  <textarea
                    className="glass-input py-2.5 text-sm w-full min-h-[72px]"
                    value={initialOpNotes}
                    onChange={(e) => setInitialOpNotes(e.target.value)}
                  />
                </Field>
              )}
              {mode === 'edit' && editVacancy && (
                <>
                  <div className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">
                      Comentarios de operación
                    </p>
                    <ul className="space-y-2 max-h-44 overflow-y-auto text-sm text-slate-700">
                      {operationNotes.length === 0 ? (
                        <li className="text-slate-400 text-xs">Sin comentarios aún.</li>
                      ) : (
                        operationNotes.map((n) => (
                          <li
                            key={n.id}
                            className="border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                          >
                            <div className="text-[10px] text-slate-500 font-medium">
                              {formatVacancyDt(n.createdAt)}
                              {n.createdByName ? ` · ${n.createdByName}` : ''}
                            </div>
                            <p className="mt-0.5 whitespace-pre-wrap">{n.text}</p>
                          </li>
                        ))
                      )}
                    </ul>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <textarea
                        className="glass-input py-2 text-sm w-full min-h-[56px] flex-1"
                        placeholder="Nuevo comentario…"
                        value={newOpNoteDraft}
                        onChange={(e) => setNewOpNoteDraft(e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={opNoteSaving}
                        onClick={() => void handleAppendOperationNote()}
                        className="glass-button-secondary py-2.5 px-4 text-xs font-bold uppercase tracking-widest whitespace-nowrap shrink-0"
                      >
                        {opNoteSaving ? '…' : 'Añadir'}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {mode === 'create' && (
                <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                  Al crear, el estado queda <strong>Abierta</strong>. La requisición se puede
                  completar en la pestaña Requisición.
                </p>
              )}
            </div>
          ) : activeTab === 'requisition' ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-slate-600">
                  {mode === 'create'
                    ? 'La requisición se registrará al confirmar, después de crear la vacante.'
                    : hasExistingReq
                      ? 'Edite los datos de la requisición existente.'
                      : 'Complete los datos para registrar la requisición al guardar.'}
                </p>
                <a
                  href={ZOHO_REQUISITION_FORM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-violet-600 hover:text-violet-800"
                >
                  Formulario Zoho
                  <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                </a>
              </div>
              {mode === 'edit' && editVacancy && (
                <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                  Vacante: <strong>{editVacancy.positionName}</strong> (
                  {editVacancy.schoolName ?? 'Sin escuela'})
                </p>
              )}
              <Field label="Número REQ (opcional)">
                <input
                  className="glass-input py-2.5 text-sm w-full font-mono"
                  value={reqNumber}
                  onChange={(e) => setReqNumber(e.target.value)}
                  placeholder="REQ-2026-001"
                />
              </Field>
              <Field label="Enviado a capital (opcional)">
                <input
                  type="date"
                  className="glass-input py-2.5 text-sm w-full"
                  value={reqSentAt}
                  onChange={(e) => setReqSentAt(e.target.value)}
                />
              </Field>
              <Field label="Notas capital humano (opcional)">
                <textarea
                  className="glass-input py-2.5 text-sm w-full min-h-[56px]"
                  value={reqCapNotes}
                  onChange={(e) => setReqCapNotes(e.target.value)}
                  placeholder="Observaciones para capital humano…"
                />
              </Field>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">
                Cumplimientos
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
                <TriField label="Terna" value={terna} onChange={setTerna} />
                <TriField label="PDA" value={pda} onChange={setPda} />
                <TriField
                  label="Condiciones contractuales"
                  value={contract}
                  onChange={setContract}
                />
                <TriField
                  label="Hojas de vida pre-entrevista"
                  value={cv}
                  onChange={setCv}
                />
              </div>
            </div>
          ) : activeTab === 'status' ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Este estado es el que define el cierre/contratación/cancelación de la vacante.
              </p>
              <Field label="Estado operación (cierre aquí)">
                <select
                  className="glass-input py-2.5 text-sm w-full min-w-0"
                  value={operationStatus}
                  onChange={(e) =>
                    setOperationStatus(e.target.value as VacancyOperationStatus)
                  }
                >
                  {(Object.keys(STATUS_LABEL) as VacancyOperationStatus[]).map((k) => (
                    <option key={k} value={k}>
                      {STATUS_LABEL[k]}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="text-xs text-slate-500">
                Para cerrar/contratar/cancelar, seleccione el estado final aquí y guarde cambios.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex gap-3 pt-4 mt-2 shrink-0 border-t border-slate-100">
          {step === 'form' ? (
            <>
              <button
                type="button"
                onClick={goToSummary}
                className="flex-1 glass-button-primary py-3 text-xs font-bold uppercase tracking-widest"
              >
                Revisar y guardar
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 glass-button-secondary py-3 text-xs font-bold uppercase tracking-widest"
              >
                Cancelar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={() => void handleConfirm()}
                className="flex-1 glass-button-primary py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-60"
              >
                {saving ? 'Guardando…' : 'Confirmar y guardar'}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => {
                  setStep('form');
                  setFormError(null);
                }}
                className="flex-1 glass-button-secondary py-3 text-xs font-bold uppercase tracking-widest"
              >
                Volver a editar
              </button>
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

function SummarySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-4 space-y-2">
      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-widest">
        {title}
      </p>
      <dl className="space-y-1.5 text-sm">{children}</dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:gap-2">
      <dt className="text-slate-500 font-medium sm:w-40 shrink-0">{label}</dt>
      <dd className="text-slate-900 whitespace-pre-wrap">{value}</dd>
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
