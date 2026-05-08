import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RectangleGroupIcon, 
  UserCircleIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  CalendarIcon, 
  DocumentTextIcon, 
  ArrowPathIcon, 
  ExclamationCircleIcon, 
  BriefcaseIcon, 
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  ClockIcon,
  XMarkIcon,
  CheckIcon,
  UserMinusIcon,
  UserPlusIcon,
} from '@heroicons/react/24/solid';
import { Teacher, View, Coordinator, Vacancy } from '@/src/types';
import { Header } from '@/src/components/layout/Header';
import {
  getTeacher,
  getTeacherByDocument,
  getTeacherAcademicLoad,
  patchTeacherActive,
} from '@/src/lib/api';

type ApiTeacherRow = Record<string, unknown>;
type AcademicLoadRow = Record<string, unknown>;

function str(v: unknown): string {
  if (v == null) return '';
  return String(v);
}

function formatDateDDMMYYYY(val: unknown): string {
  if (val == null || val === '') return '—';
  const s = String(val).slice(0, 10);
  const parts = s.split('-');
  if (parts.length >= 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return String(val);
}

function contractLabel(ct: unknown): string {
  const c = str(ct).trim().toUpperCase();
  if (c === 'F') return 'Fijo';
  if (c === 'I') return 'Indefinido';
  if (c === 'L') return 'Licencia';
  return c || '—';
}

function modalityDisplay(m: unknown): string {
  const raw = str(m).trim();
  if (!raw) return '—';
  const u = raw.toUpperCase();
  if (u === 'P' || u === 'PRESENCIAL') return 'Presencial';
  if (u === 'V' || u === 'VIRTUAL') return 'Virtual';
  return raw;
}

function teacherStatusLabel(status: unknown): string {
  const s = str(status).toLowerCase();
  if (s === 'active') return 'Activo';
  if (s === 'inactive') return 'Inactivo';
  return s ? str(status) : '—';
}

function normalizeAcademicLoad(raw: unknown): AcademicLoadRow[] {
  if (Array.isArray(raw)) return raw as AcademicLoadRow[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: AcademicLoadRow[] }).data;
  }
  return [];
}

function apiRowToTeacherDisplay(row: ApiTeacherRow | null, fallback: Teacher): {
  fullName: string;
  document: string;
  email: string;
  program: string;
  school: string;
  sede: string;
  contractType: string;
  startDate: string;
  endDate: string;
  modality: string;
  coordinator: string;
  lite: string;
  statusLabel: string;
  statusActive: boolean;
  payrollClass: string;
} {
  if (!row) {
    return {
      fullName: fallback.name,
      document: fallback.document,
      email: fallback.email,
      program: fallback.program,
      school: '—',
      sede: fallback.campus,
      contractType: '—',
      startDate: fallback.joinDate,
      endDate: 'Indefinido',
      modality: '—',
      coordinator: '—',
      lite: fallback.lite_name ?? '—',
      statusLabel: fallback.status === 'inactive' ? 'Inactivo' : 'Activo',
      statusActive: fallback.status !== 'inactive',
      payrollClass: '—',
    };
  }
  const campus = str(row.campus);
  const area = str(row.area);
  const sede = campus || area || '—';
  const endRaw = row.end_date;
  const endDate =
    endRaw == null || endRaw === '' ? 'Indefinido' : formatDateDDMMYYYY(endRaw);
  const st = str(row.status).toLowerCase();
  return {
    fullName: `${str(row.first_name)} ${str(row.last_name)}`.trim() || fallback.name,
    document: str(row.document) || fallback.document,
    email: str(row.email) || fallback.email,
    program: str(row.program) || fallback.program,
    school: str(row.school) || '—',
    sede,
    contractType: contractLabel(row.contract_type),
    startDate: formatDateDDMMYYYY(row.start_date),
    endDate,
    modality: modalityDisplay(row.modality),
    coordinator: str(row.coordinator_name) || '—',
    lite: str(row.lite_name) || fallback.lite_name || '—',
    statusLabel: teacherStatusLabel(row.status),
    statusActive: st === 'active' || st === '',
    payrollClass: str(row.payroll_class) || '—',
  };
}

interface TeacherDetailViewProps {
  teacher: Teacher;
  setView: (v: View) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const TeacherDetailView: React.FC<TeacherDetailViewProps> = ({ 
  teacher: initialTeacher, 
  setView,
  searchQuery,
  setSearchQuery,
  searchResults
}) => {
  const [teacher, setTeacher] = useState(initialTeacher);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(initialTeacher);
  const [fullTeacher, setFullTeacher] = useState<ApiTeacherRow | null>(null);
  const [academicLoad, setAcademicLoad] = useState<AcademicLoadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [teacherToggleBusy, setTeacherToggleBusy] = useState(false);

  useEffect(() => {
    setTeacher(initialTeacher);
    setEditForm(initialTeacher);
  }, [initialTeacher.id, initialTeacher.document]);

  useEffect(() => {
    let cancelled = false;
    const doc = initialTeacher.document;
    (async () => {
      setLoading(true);
      setFullTeacher(null);
      setAcademicLoad([]);
      try {
        let detail: unknown = null;
        const idNum = Number(initialTeacher.id);
        if (Number.isFinite(idNum) && idNum > 0) {
          try {
            detail = await getTeacher(idNum);
          } catch {
            detail = null;
          }
        }
        if (detail == null) {
          try {
            detail = await getTeacherByDocument(doc);
          } catch {
            detail = null;
          }
        }
        let loadRows: AcademicLoadRow[] = [];
        try {
          const loadRaw = await getTeacherAcademicLoad(doc);
          loadRows = normalizeAcademicLoad(loadRaw);
        } catch {
          loadRows = [];
        }
        if (cancelled) return;
        setFullTeacher(
          detail && typeof detail === 'object' && !Array.isArray(detail)
            ? (detail as ApiTeacherRow)
            : null
        );
        setAcademicLoad(loadRows);
      } catch {
        if (!cancelled) {
          setFullTeacher(null);
          setAcademicLoad([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initialTeacher.document]);

  const display = apiRowToTeacherDisplay(fullTeacher, initialTeacher);

  const teacherNumericId = Number(fullTeacher?.id ?? teacher.id);
  const canToggleTeacherActive =
    Number.isFinite(teacherNumericId) && teacherNumericId > 0;

  const handleToggleTeacherActive = async (makeActive: boolean) => {
    if (!canToggleTeacherActive) return;
    setTeacherToggleBusy(true);
    try {
      await patchTeacherActive(teacherNumericId, makeActive);
      if (makeActive) {
        try {
          const detail = await getTeacher(teacherNumericId);
          setFullTeacher(
            detail && typeof detail === 'object' && !Array.isArray(detail)
              ? (detail as ApiTeacherRow)
              : null
          );
        } catch {
          setFullTeacher((prev) =>
            prev ? { ...prev, status: 'active' } : prev
          );
        }
      } else {
        setFullTeacher((prev) =>
          prev ? { ...prev, status: 'inactive' } : prev
        );
      }
      setTeacher((prev) => ({
        ...prev,
        status: makeActive ? 'active' : 'inactive',
      }));
    } catch (e) {
      console.error(e);
    } finally {
      setTeacherToggleBusy(false);
    }
  };

  const handleSave = () => {
    setTeacher(editForm);
    setIsEditing(false);
  };

  return (
    <div className="space-y-10">
      <Header 
        title="Ficha del Docente" 
        subtitle="Información detallada y gestión" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <button 
        onClick={() => setView('teachers')}
        className="flex items-center gap-3 text-slate-500 font-bold hover:text-violet-600 transition-all group"
      >
        <div className="p-2 glass-card bg-white/50 group-hover:bg-violet-50 group-hover:border-violet-200 transition-all">
          <ChevronRightIcon className="h-4.5 w-4.5 rotate-180" />
        </div>
        <span className="text-xs uppercase tracking-widest">Volver a Docentes</span>
      </button>

      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="flex flex-col items-center gap-4 text-slate-500">
            <ArrowPathIcon className="h-12 w-12 animate-spin text-violet-600" />
            <span className="text-sm font-medium">Cargando ficha…</span>
          </div>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Profile Header Card */}
        <div className="lg:col-span-12 glass-panel p-10 bg-white border-white/50 overflow-hidden relative group shadow-2xl shadow-slate-200/50">
          {/* Subtle pattern background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#8B5CF6 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          
          {/* "Sparkles" / Gradient Blobs */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:scale-125 transition-transform duration-1000"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-fuchsia-500/5 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
          <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-cyan-400/10 rounded-full blur-[60px] animate-pulse"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div className="w-40 h-40 rounded-[40px] bg-white shadow-xl flex items-center justify-center text-violet-600 border border-slate-100 relative overflow-hidden group/avatar">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 opacity-0 group-hover/avatar:opacity-100 transition-opacity" />
              <UserCircleIcon className="h-24 w-24 relative z-10" />
            </div>
            <div className="text-center md:text-left flex-1 space-y-4">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                <h1 className="text-5xl font-bold tracking-tight font-display text-slate-900">{display.fullName}</h1>
                <span
                  className={`px-4 py-1.5 text-white text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg ${
                    display.statusActive
                      ? 'bg-emerald-500 shadow-emerald-500/20'
                      : 'bg-slate-400 shadow-slate-400/20'
                  }`}
                >
                  {display.statusLabel}
                </span>
              </div>
              <p className="text-violet-600 text-xl font-semibold tracking-wide">{display.program} <span className="mx-2 text-slate-200">•</span> {display.sede}</p>
              <div className="flex flex-wrap justify-center md:justify-start gap-8 pt-2">
                <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                  <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                    <EnvelopeIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <span>{display.email}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                  <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                    <PhoneIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <span>{teacher.phone || '—'}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                  <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                    <CalendarIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <span>Inicio: {display.startDate}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                  <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                    <DocumentTextIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <span>Doc. {display.document}</span>
                </div>
              </div>
              <div className="flex flex-wrap justify-center md:justify-start gap-6 pt-2 text-sm text-slate-600">
                <span><span className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Escuela</span> {display.school}</span>
                <span><span className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Modalidad</span> {display.modality}</span>
                <span><span className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Contrato</span> {display.contractType}</span>
                <span><span className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Fin</span> {display.endDate}</span>
                <span><span className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">Coordinador</span> {display.coordinator}</span>
                {display.lite && display.lite !== '—' && (
                  <span><span className="font-bold text-slate-400 text-[10px] uppercase tracking-widest">LITE</span> {display.lite}</span>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              {canToggleTeacherActive ? (
                display.statusActive ? (
                  <button
                    type="button"
                    disabled={teacherToggleBusy}
                    onClick={() => void handleToggleTeacherActive(false)}
                    className="glass-button-secondary flex items-center gap-2 border-rose-200 bg-rose-50 px-6 py-4 text-rose-700 hover:bg-rose-100 disabled:pointer-events-none disabled:opacity-50"
                    title="Inhabilitar docente"
                  >
                    <UserMinusIcon className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      Inhabilitar
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={teacherToggleBusy}
                    onClick={() => void handleToggleTeacherActive(true)}
                    className="glass-button-secondary flex items-center gap-2 border-emerald-200 bg-emerald-50 px-6 py-4 text-emerald-800 hover:bg-emerald-100 disabled:pointer-events-none disabled:opacity-50"
                    title="Habilitar docente"
                  >
                    <UserPlusIcon className="h-5 w-5" />
                    <span className="text-xs font-bold uppercase tracking-widest">
                      Habilitar
                    </span>
                  </button>
                )
              ) : null}
              <button 
                onClick={() => setIsEditing(true)}
                className="glass-button-primary px-8 py-4 shadow-xl shadow-violet-500/20 hover:scale-105 active:scale-95"
              >
                Editar Perfil
              </button>
              <button className="glass-button-secondary p-4 hover:bg-slate-50 transition-all"><EllipsisHorizontalIcon className="h-6 w-6" /></button>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="lg:col-span-8 space-y-10">
          {/* History / Timeline */}
          <div className="glass-panel p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-10 flex items-center gap-4 font-display">
              <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                <ClockIcon className="h-6 w-6 text-violet-600" />
              </div>
              Historial Operativo
            </h3>

            <div className="space-y-10 ml-4">
              {[
                {
                  date: 'Próximamente',
                  title: 'Historial operativo en construcción',
                  desc: 'Esta sección mostrará actualizaciones, renovaciones, novedades y movimientos asociados al docente.',
                  type: 'coming-soon',
                },
              ].map((item, i, arr) => (
                <div key={i} className="flex gap-8 relative">
                  {i !== arr.length - 1 && (
                    <div className="absolute left-[15px] top-10 bottom-0 w-[1px] bg-slate-100"></div>
                  )}

                  <div className="w-8 h-8 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center z-10 shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500"></div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      {item.date}
                    </p>

                    <h4 className="text-lg font-bold text-slate-900 tracking-tight">
                      {item.title}
                    </h4>

                    <p className="text-sm text-slate-500 leading-relaxed max-w-lg">
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Carga Académica */}
          <div className="glass-panel p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-6 flex items-center gap-4 font-display">
              <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                <RectangleGroupIcon className="h-6 w-6 text-violet-600" />
              </div>
              Carga Académica
            </h3>
            <p className="text-sm font-bold text-slate-600 mb-6">
              {academicLoad.length} materia{academicLoad.length === 1 ? '' : 's'} asignada{academicLoad.length === 1 ? '' : 's'}
            </p>
            {academicLoad.length === 0 ? (
              <p className="text-sm text-slate-500 py-8 text-center">Sin carga académica registrada</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-white/60 bg-white/30">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200/80 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      <th className="px-4 py-3">Materia</th>
                      <th className="px-4 py-3">Programa</th>
                      <th className="px-4 py-3">Modalidad</th>
                      <th className="px-4 py-3">Créditos</th>
                      <th className="px-4 py-3">Periodo</th>
                      <th className="px-4 py-3">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {academicLoad.map((row, i) => {
                      const tipo = str(row.type).toLowerCase();
                      const isCurrent = tipo === 'current';
                      const isProjection = tipo === 'projection';
                      return (
                        <tr key={i} className="border-b border-slate-100/80 last:border-0 hover:bg-white/40">
                          <td className="px-4 py-3 font-semibold text-slate-900">{str(row.subject_name) || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{str(row.unit_name) || str(row.pensum_code) || '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{modalityDisplay(row.modality)}</td>
                          <td className="px-4 py-3 text-slate-600">{row.credits != null ? str(row.credits) : '—'}</td>
                          <td className="px-4 py-3 text-slate-600">{str(row.period) || '—'}</td>
                          <td className="px-4 py-3">
                            {isCurrent ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200/80">
                                Actual
                              </span>
                            ) : isProjection ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider bg-violet-100 text-violet-800 border border-violet-200/80">
                                Proyección
                              </span>
                            ) : (
                              <span className="text-slate-500">{str(row.type) || '—'}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Contextual */}
        <div className="lg:col-span-4 space-y-8">
          <div className="glass-panel p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-8 font-display">Información de Contrato</h3>
            <div className="space-y-6">
              {[
                { label: 'Tipo', value: display.contractType },
                { label: 'Escalafón', value: display.payrollClass },
                { label: 'Vencimiento', value: display.endDate },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-white/40">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{row.label}</span>
                  <span className="text-sm font-bold text-slate-900 text-right max-w-[60%]">{row.value}</span>
                </div>
              ))}
            </div>
            <button className="glass-button-secondary w-full mt-10 py-4 text-xs font-bold uppercase tracking-widest">
              <DocumentTextIcon className="h-4.5 w-4.5" />
              <span>Descargar Contrato</span>
            </button>
          </div>

          <div className="glass-panel p-8 bg-gradient-to-br from-violet-50/50 to-fuchsia-50/50 border-violet-100/50">
            <h3 className="text-lg font-bold text-slate-900 mb-8 font-display">Acciones de Gestión</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Reintegro', icon: ArrowPathIcon },
                { label: 'Novedad', icon: ExclamationCircleIcon },
                { label: 'Vacante', icon: BriefcaseIcon },
                { label: 'Auditar', icon: ClockIcon },
              ].map((action, i) => (
                <button key={i} className="flex flex-col items-center gap-3 p-5 glass-card bg-white/60 border-white hover:border-violet-300 hover:shadow-violet-200/30 transition-all group">
                  <action.icon className="h-6 w-6 text-slate-400 group-hover:text-violet-600 group-hover:rotate-12 transition-all duration-300" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-violet-600">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl glass-panel p-8 relative z-10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500"></div>
              
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-slate-900 font-display">Editar Perfil</h2>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nombre Completo</label>
                    <input 
                      type="text" 
                      className="glass-input w-full"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Correo Electrónico</label>
                    <input 
                      type="email" 
                      className="glass-input w-full"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Teléfono</label>
                    <input 
                      type="text" 
                      className="glass-input w-full"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Programa</label>
                    <input 
                      type="text" 
                      className="glass-input w-full"
                      value={editForm.program}
                      onChange={(e) => setEditForm({ ...editForm, program: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-6">
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="glass-button-secondary px-8 py-3 text-xs font-bold uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="glass-button-primary px-8 py-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                  >
                    <CheckIcon className="h-4 w-4" />
                    <span>Guardar Cambios</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
