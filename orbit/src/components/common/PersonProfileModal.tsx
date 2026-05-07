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
  document?: string; // CC
  email?: string;
  phone?: string;
  campus?: string;
  school?: string;
  program?: string;
  academicLine?: string;
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
    case 'email':
      return 'Correo';
    case 'phone':
      return 'Teléfono';
    case 'campus':
      return 'Sede';
    case 'school':
      return 'Escuela';
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
      'email',
      'phone',
      'campus',
      'school',
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
    setDraft({ ...person });
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(null);
  };

  const saveEdit = () => {
    // Solo front por ahora: mantenemos el draft local (sin persistencia).
    setEditing(false);
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
                      Puedes editar la información personal excepto la cédula.
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

                  {(
                    [
                      { k: 'email', label: 'Correo' },
                      { k: 'phone', label: 'Teléfono' },
                      { k: 'campus', label: 'Sede' },
                      { k: 'school', label: 'Escuela' },
                      { k: 'program', label: 'Programa' },
                      { k: 'academicLine', label: 'Área académica' },
                      { k: 'coordinatorName', label: 'Coordinador' },
                    ] as const
                  ).map(({ k, label }) => (
                    <div
                      key={k}
                      className="p-4 rounded-2xl bg-white/40 border border-white/30"
                    >
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {label}
                      </p>
                      {editing ? (
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
                      ) : (
                        <p className="text-sm font-semibold text-slate-800 mt-1 break-words">
                          {String(person[k] ?? '—')}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
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

