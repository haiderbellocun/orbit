import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { XMarkIcon, UserPlusIcon } from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
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
  return {
    id: String(row.id ?? ''),
    document: String(row.document ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: String(row.phone ?? ''),
    school: String(row.school ?? ''),
    program: String(row.program ?? ''),
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
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [roles, setRoles] = useState<CatalogRole[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);

  const [document, setDocument] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
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
        r.role_name?.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const resetForm = () => {
    setDocument('');
    setFullName('');
    setEmail('');
    setPhone('');
    setRoleId('');
    setProgramId('');
    setFormError(null);
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
        email: email.trim() || null,
        phone: phone.trim() || null,
        role_id: rid,
        program_id:
          programId.trim() !== ''
            ? Number.parseInt(programId, 10)
            : null,
      });
      setShowCreate(false);
      resetForm();
      await loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'No se pudo crear');
    } finally {
      setSaving(false);
    }
  };

  const selectableRoles = useMemo(
    () =>
      roles.filter((r) => {
        const n = (r.name ?? '').toUpperCase();
        return n !== 'DOCENTES' && n !== 'DOCENTES PENSIONADOS';
      }),
    [roles]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8"
    >
      <Header
        title="Personal"
        subtitle="Colaboradores de tu escuela"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-4"
      >
        <p className="text-sm text-slate-500">
          {loading
            ? 'Cargando…'
            : `${filtered.length} persona${filtered.length === 1 ? '' : 's'}`}
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          type="button"
          onClick={() => {
            resetForm();
            setShowCreate(true);
          }}
          className="glass-button-primary flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
        >
          <UserPlusIcon className="h-5 w-5" />
          Crear personal
        </motion.button>
      </motion.div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </div>
      )}

      <div className="glass-panel overflow-hidden">
        <motion.div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <th className="px-6 py-4">Nombre</th>
                <th className="px-6 py-4">Documento</th>
                <th className="px-6 py-4">Rol</th>
                <th className="px-6 py-4">Programa</th>
                <th className="px-6 py-4">Contacto</th>
                <th className="px-6 py-4">Estado</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    Cargando personal…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-400">
                    No hay personal registrado en tu escuela
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b border-slate-50/80 hover:bg-violet-50/30 transition-colors"
                  >
                    <td className="px-6 py-4 font-semibold text-slate-900">{row.name}</td>
                    <td className="px-6 py-4 text-slate-600">{row.document}</td>
                    <td className="px-6 py-4 text-slate-600">{row.role_name || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">{row.program || '—'}</td>
                    <td className="px-6 py-4 text-slate-600">
                      <motion.div className="flex flex-col gap-0.5">
                        <span>{row.email || '—'}</span>
                        {row.phone ? (
                          <span className="text-xs text-slate-400">{row.phone}</span>
                        ) : null}
                      </motion.div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={cn(
                          'inline-flex rounded-lg px-2 py-1 text-[10px] font-bold uppercase',
                          row.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        )}
                      >
                        {row.status === 'active' ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </motion.div>
      </div>

      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
            onClick={() => setShowCreate(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="glass-panel w-full max-w-lg p-8"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-xl font-bold text-slate-900 font-display">
                  Nuevo personal
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
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
                    Correo
                  </span>
                  <input
                    type="email"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
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

                {formError && (
                  <p className="text-sm text-rose-600">{formError}</p>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCreate(false)}
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
