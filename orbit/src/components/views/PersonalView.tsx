import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  XMarkIcon,
  UserPlusIcon,
  UserCircleIcon,
  EnvelopeIcon,
  PhoneIcon,
  IdentificationIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import {
  PersonProfile,
  PersonProfileModal,
} from '@/src/components/common/PersonProfileModal';
import { cn } from '@/src/lib/utils';
import type { StaffMember, Vacancy, Teacher, Coordinator } from '@/src/types';
import {
  createPersonal,
  getPersonal,
  getCatalogPrograms,
  getCatalogRoles,
  type CatalogProgram,
  type CatalogRole,
} from '@/src/lib/api';

function mapStaffFromApi(row: Record<string, unknown>): StaffMember {
  const st = String(row.status ?? 'active');
  const programIdRaw = row.program_id;
  return {
    id: String(row.id ?? ''),
    document: String(row.document ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    edu_email: row.edu_email ? String(row.edu_email) : '',
    phone: String(row.phone ?? ''),
    school: String(row.school ?? ''),
    program: String(row.program ?? ''),
    program_id:
      programIdRaw != null && Number.isFinite(Number(programIdRaw))
        ? Number(programIdRaw)
        : null,
    role_id:
      row.role_id != null && Number.isFinite(Number(row.role_id))
        ? Number(row.role_id)
        : undefined,
    role_name: String(row.role_name ?? ''),
    status: st === 'inactive' ? 'inactive' : 'active',
  };
}

interface PersonalViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const PersonalView: React.FC<PersonalViewProps> = ({
  searchQuery = '',
  setSearchQuery,
}) => {
  const [rows, setRows] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [profilePerson, setProfilePerson] = useState<PersonProfile | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<CatalogRole[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);

  const [document, setDocument] = useState('');
  const [fullName, setFullName] = useState('');
  const [personalEmail, setPersonalEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleId, setRoleId] = useState('');
  const [programId, setProgramId] = useState('');

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getPersonal({ limit: 200, page: 1 });
      const list = Array.isArray(res.data)
        ? res.data.map((r) => mapStaffFromApi(r as Record<string, unknown>))
        : [];
      setRows(list);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'No se pudo cargar el personal');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (!showCreate) return;
    let cancelled = false;
    (async () => {
      try {
        const [r, p] = await Promise.all([getCatalogRoles(), getCatalogPrograms()]);
        if (!cancelled) {
          setRoles(Array.isArray(r) ? r : []);
          setPrograms(Array.isArray(p) ? p : []);
        }
      } catch {
        if (!cancelled) {
          setRoles([]);
          setPrograms([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showCreate]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.document.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.role_name?.toLowerCase().includes(q) ||
        r.program?.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const selectableRoles = useMemo(
    () =>
      roles.filter((r) => {
        const n = (r.name ?? '').toUpperCase();
        return n !== 'DOCENTES' && n !== 'DOCENTES PENSIONADOS';
      }),
    [roles]
  );

  const resetForm = () => {
    setDocument('');
    setFullName('');
    setPersonalEmail('');
    setPhone('');
    setRoleId('');
    setProgramId('');
    setFormError(null);
  };

  const openCreate = () => {
    resetForm();
    setShowCreate(true);
  };

  const openProfile = (row: StaffMember) => {
    setProfilePerson({
      id: row.id,
      name: row.name,
      document: row.document,
      role: 'staff',
    });
  };

  const closeCreate = () => {
    setShowCreate(false);
    resetForm();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const rid = Number.parseInt(roleId, 10);
    if (!document.trim() || !fullName.trim()) {
      setFormError('Documento y nombre completo son obligatorios');
      return;
    }
    if (!Number.isFinite(rid) || rid <= 0) {
      setFormError('Selecciona un rol');
      return;
    }
    setSaving(true);
    try {
      await createPersonal({
        document: document.trim(),
        full_name: fullName.trim(),
        email: personalEmail.trim() || null,
        phone: phone.trim() || null,
        role_id: rid,
        program_id:
          programId.trim() !== '' ? Number.parseInt(programId, 10) : null,
      });
      closeCreate();
      await loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 relative"
    >
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Personal"
        subtitle="Colaboradores de tu escuela"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div className="glass-panel p-4 flex flex-col md:flex-row gap-4 items-center flex-1">
          <div className="relative flex-1 w-full">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar colaborador..."
              className="glass-input w-full pl-10 pr-4 py-3 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button
              type="button"
              className="glass-button-secondary flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 text-sm"
            >
              <FunnelIcon className="h-4.5 w-4.5" />
              <span>Filtros</span>
            </button>
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={openCreate}
          className="glass-button-primary flex items-center gap-2 px-5 py-3 h-fit text-sm font-bold"
        >
          <UserPlusIcon className="h-5 w-5" />
          Crear personal
        </motion.button>
      </div>

      <p className="text-sm text-slate-500 relative z-10">
        {loading
          ? 'Cargando…'
          : `${filtered.length} persona${filtered.length === 1 ? '' : 's'}`}
      </p>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 relative z-10">
          {loadError}
        </div>
      )}

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 relative z-10">
          <div className="h-10 w-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-600">Cargando personal…</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          {filtered.map((row, i) => (
            <motion.div
              key={row.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                'glass-card p-6 flex flex-col items-center text-center group transition-all duration-300 border-t-4',
                i % 2 === 0 ? 'border-t-violet-500/50' : 'border-t-cyan-500/50'
              )}
            >
              <div className="relative mb-4">
                <button
                  type="button"
                  onClick={() => openProfile(row)}
                  className="w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center text-slate-300 group-hover:from-violet-50 group-hover:to-fuchsia-50 group-hover:text-violet-500 transition-all shadow-inner focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                  title="Ver información personal"
                  aria-label="Ver información personal"
                >
                  <UserCircleIcon className="h-12 w-12" />
                </button>
                <div
                  className={cn(
                    'absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white shadow-sm',
                    row.status === 'active' ? 'bg-emerald-500' : 'bg-slate-300'
                  )}
                />
              </div>

              <h3 className="text-lg font-bold text-slate-900 font-display group-hover:text-violet-600 transition-colors line-clamp-2">
                {row.name}
              </h3>
              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-[0.2em] mt-1 line-clamp-2">
                {row.role_name || 'Sin rol'}
              </p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.18em] mt-1 line-clamp-2">
                {row.program || row.school || '—'}
              </p>

              <div className="mt-6 w-full space-y-3">
                {row.document ? (
                  <div className="flex items-center gap-3 text-xs text-slate-500 bg-white/40 p-2 rounded-lg border border-white/20">
                    <IdentificationIcon className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
                    <span className="truncate">{row.document}</span>
                  </div>
                ) : null}
                <div className="flex items-center gap-3 text-xs text-slate-500 bg-white/40 p-2 rounded-lg border border-white/20">
                  <EnvelopeIcon className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  <span className="truncate">{row.email || '—'}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 bg-white/40 p-2 rounded-lg border border-white/20">
                  <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  <span>{row.phone || '—'}</span>
                </div>
              </div>

              <span
                className={cn(
                  'mt-4 text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-xl border',
                  row.status === 'active'
                    ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                    : 'text-slate-500 bg-slate-100 border-slate-200'
                )}
              >
                {row.status === 'active' ? 'Activo' : 'Inactivo'}
              </span>

              <button
                type="button"
                onClick={() => openProfile(row)}
                className="w-full mt-6 py-3 glass-button-secondary text-xs flex items-center justify-center gap-2 group/btn"
              >
                <PencilSquareIcon className="h-3.5 w-3.5" />
                <span>Ver perfil</span>
              </button>
            </motion.div>
          ))}
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-20 flex flex-col items-center justify-center text-center relative z-10"
        >
          <div className="w-24 h-24 rounded-full bg-slate-50 flex items-center justify-center text-slate-200 mb-6">
            <MagnifyingGlassIcon className="h-12 w-12" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2 font-display">
            No hay personal registrado
          </h3>
          <p className="text-slate-500 max-w-md">
            {searchQuery.trim()
              ? 'Intenta ajustar los criterios de búsqueda.'
              : 'Crea el primer colaborador de tu escuela con el botón Crear personal.'}
          </p>
          {searchQuery.trim() ? (
            <button
              type="button"
              onClick={() => setSearchQuery?.('')}
              className="text-violet-600 font-bold text-xs uppercase tracking-widest hover:underline pt-4"
            >
              Limpiar búsqueda
            </button>
          ) : null}
        </motion.div>
      )}

      <PersonProfileModal
        open={!!profilePerson}
        person={profilePerson}
        onClose={() => setProfilePerson(null)}
        onProfileUpdated={() => void loadList()}
      />

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
            onClick={closeCreate}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-lg p-8 max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 font-display">
                  Nuevo personal
                </h2>
                <button
                  type="button"
                  onClick={closeCreate}
                  className="p-2 text-slate-400 hover:text-slate-600"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleCreate} className="space-y-4">
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Documento *
                  </span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    value={document}
                    onChange={(e) => setDocument(e.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Nombre completo *
                  </span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Rol *
                  </span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    value={roleId}
                    onChange={(e) => setRoleId(e.target.value)}
                    required
                  >
                    <option value="">Seleccionar…</option>
                    {selectableRoles.map((r) => (
                      <option key={r.id} value={String(r.id)}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Programa
                  </span>
                  <select
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    value={programId}
                    onChange={(e) => setProgramId(e.target.value)}
                  >
                    <option value="">Sin programa</option>
                    {programs.map((p) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Correo personal
                  </span>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    value={personalEmail}
                    onChange={(e) => setPersonalEmail(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Teléfono
                  </span>
                  <input
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </label>

                {formError && <p className="text-sm text-rose-600">{formError}</p>}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeCreate}
                    className="glass-button-secondary flex-1 py-2.5 text-sm font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="glass-button-primary flex-1 py-2.5 text-sm font-bold disabled:opacity-60"
                  >
                    {saving ? 'Guardando…' : 'Crear'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
