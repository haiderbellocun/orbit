import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckIcon,
  PencilSquareIcon,
  UserCircleIcon,
  UserMinusIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';

export type PersonProfile = {
  id: string;
  name: string;
  role?: 'lite' | 'coordinator';
  document?: string; // CC
  edu_email?: string; // institucional (no editable)
  personal_email?: string; // editable
  phone?: string;
  address?: string;
  campus?: string;
  school?: string;
  programs?: string[]; // LITE: selección múltiple
  program?: string; // legacy / fallback para cards
  academicLine?: string; // legacy / fallback para cards
  person_program_assignments?: Array<{
    program: string;
    academic_line?: string;
  }>;
  coordinatorName?: string;
  status?: 'active' | 'inactive' | 'on-leave';
};

type NewsTypeOption = { id: string; label: string };

type PersonNewsItem = {
  id: string;
  type: string;
  text: string;
  createdAt: string;
};

export interface PersonProfileModalProps {
  open: boolean;
  person: PersonProfile | null;
  onClose: () => void;
}

type TabId = 'personal' | 'news' | 'admin';

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function fieldLabel(key: keyof PersonProfile): string {
  switch (key) {
    case 'document':
      return 'Cédula';
    case 'name':
      return 'Nombre';
    case 'edu_email':
      return 'Correo institucional';
    case 'personal_email':
      return 'Correo personal';
    case 'phone':
      return 'Teléfono';
    case 'address':
      return 'Dirección';
    case 'campus':
      return 'Sede';
    case 'school':
      return 'Escuela';
    case 'programs':
      return 'Programas';
    case 'program':
      return 'Programa';
    case 'academicLine':
      return 'Área académica';
    case 'coordinatorName':
      return 'Coordinador';
    case 'status':
      return 'Estado';
    default:
      return String(key);
  }
}

function statusLabel(st?: PersonProfile['status']): string {
  if (st === 'active') return 'Activo';
  if (st === 'inactive') return 'Inactivo';
  if (st === 'on-leave') return 'En licencia';
  return '—';
}

export const PersonProfileModal: React.FC<PersonProfileModalProps> = ({
  open,
  person,
  onClose,
}) => {
  const [tab, setTab] = useState<TabId>('personal');
  const [draft, setDraft] = useState<PersonProfile | null>(null);
  const [editing, setEditing] = useState(false);

  const SCHOOL_OPTIONS = useMemo(
    () => [
      'Área Académica Transversales',
      'Escuela de Ingeniería',
      'Escuela de Negocios',
      'Escuela de Salud',
      'Escuela de Humanidades',
      'Escuela de Educación',
      'Otra',
    ],
    []
  );
  const PROGRAM_OPTIONS = useMemo(
    () => [
      'Ingeniería de Sistemas',
      'Administración de Empresas',
      'Contaduría Pública',
      'Psicología',
      'Enfermería',
      'Derecho',
      'Otra',
    ],
    []
  );

  const [newsTypeOptions, setNewsTypeOptions] = useState<NewsTypeOption[]>([
    { id: 'license', label: 'LICENCIA' },
    { id: 'sanction', label: 'SANCION' },
    { id: 'custom', label: 'Agregar más…' },
  ]);
  const [newsType, setNewsType] = useState<string>('license');
  const [customNewsType, setCustomNewsType] = useState<string>('');
  const [newsText, setNewsText] = useState<string>('');
  const [newsItems, setNewsItems] = useState<PersonNewsItem[]>([]);

  const visibleFields = useMemo(() => {
    if (!person) return [];
    const ordered: (keyof PersonProfile)[] = [
      'document',
      'edu_email',
      'personal_email',
      'phone',
      'address',
      'campus',
      'school',
      'programs',
      'program',
      'academicLine',
      'coordinatorName',
      'status',
    ];
    return ordered
      .map((k) => ({ key: k, value: person[k] }))
      .filter((x) => x.value !== undefined && x.value !== '');
  }, [person]);

  const beginEdit = () => {
    if (!person) return;
    setEditing(true);
    const next: PersonProfile = { ...person };
    if (next.role === 'lite') {
      const programsSeed =
        next.programs && next.programs.length > 0
          ? next.programs
          : next.program
            ? [next.program]
            : [];
      next.programs = programsSeed;
      if (!next.person_program_assignments) {
        next.person_program_assignments = programsSeed.map((p) => ({
          program: p,
          academic_line: next.academicLine || '',
        }));
      }
    }
    setDraft(next);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
  };

  const saveEdit = () => {
    // Solo front por ahora: mantenemos el draft local (sin persistencia).
    setEditing(false);
  };

  const isLite = (person?.role ?? 'lite') === 'lite';
  const isCoordinator = (person?.role ?? 'coordinator') === 'coordinator';

  const draftAssignments = (draft?.person_program_assignments ?? []).filter(
    (a) => a.program
  );

  const ensureAssignmentsMatchPrograms = (programs: string[]) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const existing = prev.person_program_assignments ?? [];
      const byProgram = new Map(existing.map((a) => [a.program, a]));
      const nextAssignments = programs.map((p) => {
        const found = byProgram.get(p);
        return found ?? { program: p, academic_line: '' };
      });
      return {
        ...prev,
        programs,
        person_program_assignments: nextAssignments,
      };
    });
  };

  const addCustomTypeIfNeeded = (label: string) => {
    const normalized = label.trim().toUpperCase();
    if (!normalized) return null;
    const exists = newsTypeOptions.some((o) => o.label === normalized);
    if (exists) return normalized;
    const id = `custom-${normalized.toLowerCase().replace(/\s+/g, '-')}`;
    setNewsTypeOptions((prev) => [
      { id, label: normalized },
      ...prev.filter((p) => p.id !== 'custom'),
      { id: 'custom', label: 'Agregar más…' },
    ]);
    return normalized;
  };

  const handleAddNews = () => {
    const text = newsText.trim();
    if (!text) return;

    let typeLabel =
      newsTypeOptions.find((o) => o.id === newsType)?.label ?? 'OTRA';

    if (newsType === 'custom') {
      const added = addCustomTypeIfNeeded(customNewsType);
      typeLabel = added ?? 'OTRA';
    }

    const now = new Date();
    setNewsItems((prev) => [
      {
        id: `${now.getTime()}-${Math.random().toString(16).slice(2)}`,
        type: typeLabel,
        text,
        createdAt: now.toISOString(),
      },
      ...prev,
    ]);
    setNewsText('');
    setCustomNewsType('');
    if (newsType === 'custom') setNewsType('license');
  };

  return (
    <AnimatePresence>
      {open && person ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 16 }}
            className="w-full max-w-3xl glass-panel p-8 relative z-10 shadow-2xl overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500" />

            <div className="flex items-start justify-between gap-6 mb-6">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center text-violet-500 shadow-inner shrink-0">
                  <UserCircleIcon className="h-9 w-9" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-slate-900 font-display truncate">
                    {person.name}
                  </h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em]">
                    {statusLabel(person.status)}
                    {person.document ? ` • CC ${person.document}` : ''}
                  </p>
                </div>
              </div>

              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                aria-label="Cerrar"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="flex items-center gap-2 mb-6">
              {(
                [
                  { id: 'personal', label: 'Información personal' },
                  { id: 'news', label: 'Novedades' },
                  { id: 'admin', label: 'Panel de administración' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTab(t.id);
                    if (t.id !== 'admin') cancelEdit();
                  }}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all',
                    tab === t.id
                      ? 'bg-violet-600 text-white border-violet-600 shadow-sm'
                      : 'bg-white/40 text-slate-600 border-white/30 hover:bg-white/60'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === 'personal' ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {visibleFields.length === 0 ? (
                    <div className="text-sm text-slate-500">
                      No hay información para mostrar.
                    </div>
                  ) : (
                    visibleFields.map(({ key, value }) => (
                      <div
                        key={String(key)}
                        className="p-4 rounded-2xl bg-white/40 border border-white/30"
                      >
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {fieldLabel(key)}
                        </p>
                        <p className="text-sm font-semibold text-slate-800 mt-1 break-words">
                          {key === 'status' ? statusLabel(value as any) : String(value)}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : tab === 'news' ? (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Tipo
                    </label>
                    <select
                      className="glass-input w-full mt-1 py-3 text-sm"
                      value={newsType}
                      onChange={(e) => setNewsType(e.target.value)}
                    >
                      {newsTypeOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {newsType === 'custom' ? (
                      <input
                        type="text"
                        className="glass-input w-full mt-2 py-3 text-sm"
                        placeholder="Escribe el nuevo tipo (ej: PERMISO)"
                        value={customNewsType}
                        onChange={(e) => setCustomNewsType(e.target.value)}
                      />
                    ) : null}
                  </div>

                  <div className="md:col-span-6">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Novedad
                    </label>
                    <input
                      type="text"
                      className="glass-input w-full mt-1 py-3 text-sm"
                      placeholder="Describe la novedad…"
                      value={newsText}
                      onChange={(e) => setNewsText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleAddNews();
                      }}
                    />
                  </div>

                  <div className="md:col-span-2 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddNews}
                      className="glass-button-primary w-full py-3 text-xs font-bold uppercase tracking-widest"
                    >
                      Agregar
                    </button>
                  </div>
                </div>

                <div className="max-h-[320px] overflow-y-auto pr-2 custom-scrollbar space-y-3">
                  {newsItems.length === 0 ? (
                    <div className="p-8 rounded-2xl bg-white/40 border border-white/30 text-sm text-slate-500">
                      Aún no hay novedades registradas (solo front por ahora).
                    </div>
                  ) : (
                    newsItems.map((n) => (
                      <div
                        key={n.id}
                        className="p-4 rounded-2xl bg-white/40 border border-white/30"
                      >
                        <div className="flex items-center justify-between gap-4">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-violet-600">
                            {n.type}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {formatDateTime(new Date(n.createdAt))}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 mt-2">{n.text}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900 font-display">
                      Administración
                    </p>
                    <p className="text-xs text-slate-500">
                      Puedes editar la información personal excepto la cédula y el correo institucional.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        // Solo front: no cambia estado real aún.
                      }}
                      title="Inactivar usuario"
                      className="p-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors"
                      aria-label="Inactivar usuario"
                    >
                      <UserMinusIcon className="h-5 w-5" />
                    </button>

                    {!editing ? (
                      <button
                        type="button"
                        onClick={beginEdit}
                        className="glass-button-secondary px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                        Editar
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={saveEdit}
                          className="glass-button-primary px-4 py-2 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                        >
                          <CheckIcon className="h-4 w-4" />
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="glass-button-secondary px-4 py-2 text-xs font-bold uppercase tracking-widest"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-white/40 border border-white/30">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Cédula (no editable)
                    </p>
                    <p className="text-sm font-semibold text-slate-800 mt-1 break-words">
                      {person.document || '—'}
                    </p>
                  </div>

                  <div className="p-4 rounded-2xl bg-white/40 border border-white/30">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                      Correo institucional (no editable)
                    </p>
                    <p className="text-sm font-semibold text-slate-800 mt-1 break-words">
                      {person.edu_email || '—'}
                    </p>
                  </div>

                  {(
                    [
                      { k: 'school', label: 'Escuela', type: 'school' as const },
                      { k: 'phone', label: 'Teléfono', type: 'text' as const },
                      { k: 'personal_email', label: 'Correo personal', type: 'text' as const },
                      { k: 'address', label: 'Dirección', type: 'text' as const },
                    ] as const
                  ).map(({ k, label, type }) => (
                    <div
                      key={k}
                      className="p-4 rounded-2xl bg-white/40 border border-white/30"
                    >
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {label}
                      </p>
                      {editing ? (
                        type === 'school' ? (
                          <select
                            className="glass-input w-full mt-2 py-3 text-sm"
                            value={String((draft?.[k] ?? '') as any)}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev ? { ...prev, [k]: e.target.value } : prev
                              )
                            }
                          >
                            <option value="">Selecciona…</option>
                            {SCHOOL_OPTIONS.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            type="text"
                            className="glass-input w-full mt-2 py-3 text-sm"
                            value={String((draft?.[k] ?? '') as any)}
                            onChange={(e) =>
                              setDraft((prev) =>
                                prev ? { ...prev, [k]: e.target.value } : prev
                              )
                            }
                          />
                        )
                      ) : (
                        <p className="text-sm font-semibold text-slate-800 mt-1 break-words">
                          {String(person[k] ?? '—')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {isLite ? (
                  <div className="mt-2 p-5 rounded-2xl bg-white/40 border border-white/30 space-y-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Programas
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        Se pueden seleccionar múltiples programas.
                      </p>
                    </div>

                    {editing ? (
                      <select
                        multiple
                        className="glass-input w-full mt-1 py-3 text-sm min-h-[8.5rem]"
                        value={draft?.programs ?? []}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions).map(
                            (o) => o.value
                          );
                          ensureAssignmentsMatchPrograms(selected);
                        }}
                      >
                        {PROGRAM_OPTIONS.map((p) => (
                          <option key={p} value={p}>
                            {p}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm font-semibold text-slate-800">
                        {(person.programs ?? []).length > 0
                          ? (person.programs ?? []).join(' • ')
                          : person.program
                            ? person.program
                            : '—'}
                      </p>
                    )}

                    <div className="space-y-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        Línea académica
                      </p>

                      {(editing ? draftAssignments : person.person_program_assignments ?? [])
                        .filter((a) => a.program)
                        .map((a) => (
                          <div
                            key={a.program}
                            className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center"
                          >
                            <div className="md:col-span-5">
                              <p className="text-xs font-bold text-slate-700 truncate" title={a.program}>
                                {a.program}
                              </p>
                            </div>
                            <div className="md:col-span-7">
                              {editing ? (
                                <input
                                  type="text"
                                  className="glass-input w-full py-3 text-sm"
                                  placeholder="Área académica…"
                                  value={a.academic_line ?? ''}
                                  onChange={(e) =>
                                    setDraft((prev) => {
                                      if (!prev) return prev;
                                      const list = prev.person_program_assignments ?? [];
                                      return {
                                        ...prev,
                                        person_program_assignments: list.map((x) =>
                                          x.program === a.program
                                            ? { ...x, academic_line: e.target.value }
                                            : x
                                        ),
                                      };
                                    })
                                  }
                                />
                              ) : (
                                <p className="text-sm text-slate-700">
                                  {a.academic_line || '—'}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-8 flex justify-end">
              <button
                onClick={onClose}
                className="glass-button-primary px-8 py-3 text-xs font-bold uppercase tracking-widest"
              >
                Cerrar
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};

