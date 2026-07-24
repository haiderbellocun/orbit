import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
  PencilSquareIcon,
  UserCircleIcon,
  EnvelopeIcon,
  IdentificationIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import type { PlantaPerson, Vacancy, Teacher, Coordinator } from '@/src/types';
import {
  getPlantaActiva,
  getPlantaPerson,
  updatePlantaPerson,
  getCatalogAreas,
  getCatalogSchools,
  getCatalogPrograms,
  getCatalogRoles,
  type CatalogArea,
  type CatalogSchool,
  type CatalogProgram,
  type CatalogRole,
} from '@/src/lib/api';

function mapPlantaFromApi(row: Record<string, unknown>): PlantaPerson {
  const st = String(row.status ?? 'active');
  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id: String(row.id ?? ''),
    document: String(row.document ?? ''),
    type_document: row.type_document ? String(row.type_document) : undefined,
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    edu_email: String(row.edu_email ?? ''),
    phone: String(row.phone ?? ''),
    address: row.address ? String(row.address) : undefined,
    area_id: numOrNull(row.area_id),
    area: String(row.area ?? ''),
    school_id: numOrNull(row.school_id),
    school: String(row.school ?? ''),
    program_id: numOrNull(row.program_id),
    program: String(row.program ?? ''),
    role_id: numOrNull(row.role_id),
    role_name: String(row.role_name ?? ''),
    status: st === 'inactive' ? 'inactive' : 'active',
  };
}

interface PlantaActivaViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

type Filters = {
  search: string;
  areaId: string;
  schoolId: string;
  programId: string;
  roleId: string;
  withoutSchool: boolean;
  withoutProgram: boolean;
  withoutRole: boolean;
  withoutEduEmail: boolean;
};

const EMPTY_FILTERS: Filters = {
  search: '',
  areaId: '',
  schoolId: '',
  programId: '',
  roleId: '',
  withoutSchool: false,
  withoutProgram: false,
  withoutRole: false,
  withoutEduEmail: false,
};

export const PlantaActivaView: React.FC<PlantaActivaViewProps> = ({
  onOpenVacancyFromNotification,
}) => {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [applied, setApplied] = useState<Filters>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<PlantaPerson[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [schools, setSchools] = useState<CatalogSchool[]>([]);
  const [programs, setPrograms] = useState<CatalogProgram[]>([]);
  const [roles, setRoles] = useState<CatalogRole[]>([]);

  const [editing, setEditing] = useState<PlantaPerson | null>(null);
  const [editForm, setEditForm] = useState({
    full_name: '',
    document: '',
    email: '',
    edu_email: '',
    phone: '',
    address: '',
    area_id: '',
    school_id: '',
    program_id: '',
    role_id: '',
    is_active: true,
  });
  const [editSchools, setEditSchools] = useState<CatalogSchool[]>([]);
  const [editPrograms, setEditPrograms] = useState<CatalogProgram[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, r] = await Promise.all([getCatalogAreas(), getCatalogRoles()]);
        if (!cancelled) {
          setAreas(Array.isArray(a) ? a : []);
          setRoles(Array.isArray(r) ? r : []);
        }
      } catch {
        if (!cancelled) {
          setAreas([]);
          setRoles([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const areaId = filters.areaId ? Number(filters.areaId) : undefined;
    (async () => {
      try {
        const s = await getCatalogSchools(
          areaId != null && Number.isFinite(areaId) ? { area_id: areaId } : undefined
        );
        if (!cancelled) setSchools(Array.isArray(s) ? s : []);
      } catch {
        if (!cancelled) setSchools([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.areaId]);

  useEffect(() => {
    let cancelled = false;
    const schoolId = filters.schoolId ? Number(filters.schoolId) : undefined;
    (async () => {
      try {
        const p = await getCatalogPrograms(
          schoolId != null && Number.isFinite(schoolId)
            ? { school_id: schoolId }
            : undefined
        );
        if (!cancelled) setPrograms(Array.isArray(p) ? p : []);
      } catch {
        if (!cancelled) setPrograms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.schoolId]);

  const loadList = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await getPlantaActiva({
        search: applied.search.trim() || undefined,
        area_id: applied.areaId ? Number(applied.areaId) : undefined,
        school_id: applied.schoolId ? Number(applied.schoolId) : undefined,
        program_id: applied.programId ? Number(applied.programId) : undefined,
        role_id: applied.roleId ? Number(applied.roleId) : undefined,
        without_school: applied.withoutSchool || undefined,
        without_program: applied.withoutProgram || undefined,
        without_role: applied.withoutRole || undefined,
        without_edu_email: applied.withoutEduEmail || undefined,
        page,
        limit: 50,
      });
      const list = Array.isArray(res.data)
        ? res.data.map((r) => mapPlantaFromApi(r as Record<string, unknown>))
        : [];
      setRows(list);
      setTotal(res.pagination?.total ?? list.length);
      setTotalPages(res.pagination?.totalPages ?? 1);
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'No se pudo cargar la planta activa'
      );
      setRows([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const applyFilters = () => {
    setPage(1);
    setApplied({ ...filters });
  };

  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setPage(1);
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (applied.search.trim()) n++;
    if (applied.areaId) n++;
    if (applied.schoolId) n++;
    if (applied.programId) n++;
    if (applied.roleId) n++;
    if (applied.withoutSchool) n++;
    if (applied.withoutProgram) n++;
    if (applied.withoutRole) n++;
    if (applied.withoutEduEmail) n++;
    return n;
  }, [applied]);

  const openEdit = async (row: PlantaPerson) => {
    setFormError(null);
    setEditing(row);
    setEditForm({
      full_name: row.name,
      document: row.document,
      email: row.email,
      edu_email: row.edu_email,
      phone: row.phone,
      address: row.address ?? '',
      area_id: row.area_id != null ? String(row.area_id) : '',
      school_id: row.school_id != null ? String(row.school_id) : '',
      program_id: row.program_id != null ? String(row.program_id) : '',
      role_id: row.role_id != null ? String(row.role_id) : '',
      is_active: row.status === 'active',
    });
    try {
      const detail = await getPlantaPerson(Number(row.id));
      const mapped = mapPlantaFromApi(detail as Record<string, unknown>);
      setEditForm({
        full_name: mapped.name,
        document: mapped.document,
        email: mapped.email,
        edu_email: mapped.edu_email,
        phone: mapped.phone,
        address: mapped.address ?? '',
        area_id: mapped.area_id != null ? String(mapped.area_id) : '',
        school_id: mapped.school_id != null ? String(mapped.school_id) : '',
        program_id: mapped.program_id != null ? String(mapped.program_id) : '',
        role_id: mapped.role_id != null ? String(mapped.role_id) : '',
        is_active: mapped.status === 'active',
      });
    } catch {
      /* keep list row data */
    }
  };

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    const areaId = editForm.area_id ? Number(editForm.area_id) : undefined;
    (async () => {
      try {
        const s = await getCatalogSchools(
          areaId != null && Number.isFinite(areaId) ? { area_id: areaId } : undefined
        );
        if (!cancelled) setEditSchools(Array.isArray(s) ? s : []);
      } catch {
        if (!cancelled) setEditSchools([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, editForm.area_id]);

  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    const schoolId = editForm.school_id ? Number(editForm.school_id) : undefined;
    (async () => {
      try {
        const p = await getCatalogPrograms(
          schoolId != null && Number.isFinite(schoolId)
            ? { school_id: schoolId }
            : undefined
        );
        if (!cancelled) setEditPrograms(Array.isArray(p) ? p : []);
      } catch {
        if (!cancelled) setEditPrograms([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editing, editForm.school_id]);

  const closeEdit = () => {
    setEditing(null);
    setFormError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setFormError(null);
    if (!editForm.full_name.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    try {
      await updatePlantaPerson(Number(editing.id), {
        full_name: editForm.full_name.trim(),
        document: editForm.document.trim() || undefined,
        email: editForm.email.trim() || null,
        edu_email: editForm.edu_email.trim() || null,
        phone: editForm.phone.trim() || null,
        address: editForm.address.trim() || null,
        area_id: editForm.area_id ? Number(editForm.area_id) : null,
        school_id: editForm.school_id ? Number(editForm.school_id) : null,
        program_id: editForm.program_id ? Number(editForm.program_id) : null,
        role_id: editForm.role_id ? Number(editForm.role_id) : null,
        is_active: editForm.is_active,
      });
      closeEdit();
      await loadList();
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'No se pudo guardar los cambios'
      );
    } finally {
      setSaving(false);
    }
  };

  const selectClass =
    'w-full rounded-xl border border-slate-200/80 bg-white/80 px-3 py-2.5 text-sm text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-400/40';

  return (
    <div className="space-y-8">
      <Header
        title="Planta Activa"
        subtitle="Personas con estado activo en el sistema"
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      <div className="glass-panel p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-700">
          <FunnelIcon className="h-5 w-5 text-violet-600" />
          <h3 className="font-display font-bold text-lg">Filtros</h3>
          {activeFilterCount > 0 && (
            <span className="text-[10px] font-bold uppercase tracking-widest bg-violet-100 text-violet-700 px-2 py-1 rounded-lg">
              {activeFilterCount} activo{activeFilterCount === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <label className="space-y-1.5 md:col-span-2 xl:col-span-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Nombre, correo o identificación
            </span>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={filters.search}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, search: e.target.value }))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') applyFilters();
                }}
                placeholder="Buscar por nombre, correo o cédula…"
                className={cn(selectClass, 'pl-10')}
              />
            </div>
          </label>

          <label className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Área
            </span>
            <select
              value={filters.areaId}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  areaId: e.target.value,
                  schoolId: '',
                  programId: '',
                }))
              }
              className={selectClass}
            >
              <option value="">Todas</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Escuela
            </span>
            <select
              value={filters.schoolId}
              onChange={(e) =>
                setFilters((f) => ({
                  ...f,
                  schoolId: e.target.value,
                  programId: '',
                }))
              }
              className={selectClass}
            >
              <option value="">Todas</option>
              {schools.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Programa
            </span>
            <select
              value={filters.programId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, programId: e.target.value }))
              }
              className={selectClass}
            >
              <option value="">Todos</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              Rol
            </span>
            <select
              value={filters.roleId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, roleId: e.target.value }))
              }
              className={selectClass}
            >
              <option value="">Todos</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-4 pt-1">
          {(
            [
              ['withoutSchool', 'Sin escuela'],
              ['withoutProgram', 'Sin programa'],
              ['withoutRole', 'Sin rol'],
              ['withoutEduEmail', 'Sin correo institucional'],
            ] as const
          ).map(([key, label]) => (
            <label
              key={key}
              className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters[key]}
                onChange={(e) =>
                  setFilters((f) => ({ ...f, [key]: e.target.checked }))
                }
                className="rounded border-slate-300 text-violet-600 focus:ring-violet-400"
              />
              {label}
            </label>
          ))}
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={applyFilters}
            className="glass-button-primary px-5 py-2.5 text-sm font-bold"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={clearFilters}
            className="glass-button-secondary px-5 py-2.5 text-sm font-bold"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-slate-500">
          {loading
            ? 'Cargando…'
            : `${total.toLocaleString('es-CO')} persona${total === 1 ? '' : 's'} activa${total === 1 ? '' : 's'}`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="text-xs font-bold text-slate-500">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="glass-button-secondary px-3 py-1.5 text-xs font-bold disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        )}
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {loadError}
        </div>
      )}

      <div className="glass-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <th className="px-5 py-4">Persona</th>
                <th className="px-5 py-4">Identificación</th>
                <th className="px-5 py-4">Área / Escuela</th>
                <th className="px-5 py-4">Programa</th>
                <th className="px-5 py-4">Rol</th>
                <th className="px-5 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-16 text-center text-slate-400"
                  >
                    No hay personas que coincidan con los filtros.
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.3) }}
                  className="border-b border-slate-50 hover:bg-violet-50/30 transition-colors"
                >
                  <td className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-9 h-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center shrink-0">
                        <UserCircleIcon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 truncate">
                          {row.name || '—'}
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                          <EnvelopeIcon className="h-3 w-3 shrink-0" />
                          {row.edu_email || row.email || 'Sin correo'}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex items-center gap-1.5 text-slate-700">
                      <IdentificationIcon className="h-3.5 w-3.5 text-slate-400" />
                      {row.document || '—'}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="space-y-0.5">
                      <p className="text-slate-800">{row.area || '—'}</p>
                      <p className="text-xs text-slate-500 flex items-center gap-1">
                        <BuildingOffice2Icon className="h-3 w-3" />
                        {row.school || 'Sin escuela'}
                      </p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-700">
                    {row.program || '—'}
                  </td>
                  <td className="px-5 py-4">
                    <span className="inline-flex px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 text-xs font-semibold">
                      {row.role_name || 'Sin rol'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      type="button"
                      onClick={() => void openEdit(row)}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-violet-600 hover:text-violet-800"
                    >
                      <PencilSquareIcon className="h-4 w-4" />
                      Gestionar
                    </button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
            onClick={closeEdit}
          >
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-xl font-display font-bold text-slate-900">
                    Información general
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">
                    Datos básicos de la persona en planta
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeEdit}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-400"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Nombre completo
                    </span>
                    <input
                      value={editForm.full_name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, full_name: e.target.value }))
                      }
                      className={selectClass}
                      required
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Identificación
                    </span>
                    <input
                      value={editForm.document}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, document: e.target.value }))
                      }
                      className={selectClass}
                      placeholder={
                        editing.document
                          ? 'Solo editable si está vacío'
                          : 'Cédula'
                      }
                      disabled={Boolean(editing.document?.trim())}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Teléfono
                    </span>
                    <input
                      value={editForm.phone}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      className={selectClass}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Correo personal
                    </span>
                    <input
                      type="email"
                      value={editForm.email}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, email: e.target.value }))
                      }
                      className={selectClass}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Correo institucional
                    </span>
                    <input
                      type="email"
                      value={editForm.edu_email}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, edu_email: e.target.value }))
                      }
                      className={selectClass}
                    />
                  </label>
                  <label className="space-y-1.5 sm:col-span-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Dirección
                    </span>
                    <input
                      value={editForm.address}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, address: e.target.value }))
                      }
                      className={selectClass}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Área
                    </span>
                    <select
                      value={editForm.area_id}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          area_id: e.target.value,
                          school_id: '',
                          program_id: '',
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="">Sin área</option>
                      {areas.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Escuela
                    </span>
                    <select
                      value={editForm.school_id}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          school_id: e.target.value,
                          program_id: '',
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="">Sin escuela</option>
                      {editSchools.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Programa
                    </span>
                    <select
                      value={editForm.program_id}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          program_id: e.target.value,
                        }))
                      }
                      className={selectClass}
                    >
                      <option value="">Sin programa</option>
                      {editPrograms.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Rol
                    </span>
                    <select
                      value={editForm.role_id}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, role_id: e.target.value }))
                      }
                      className={selectClass}
                    >
                      <option value="">Sin rol</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="inline-flex items-center gap-2 text-sm text-slate-700 pt-6">
                    <input
                      type="checkbox"
                      checked={editForm.is_active}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          is_active: e.target.checked,
                        }))
                      }
                      className="rounded border-slate-300 text-violet-600 focus:ring-violet-400"
                    />
                    Persona activa (`is_active`)
                  </label>
                </div>

                {formError && (
                  <p className="text-sm text-rose-600 font-medium">{formError}</p>
                )}

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={closeEdit}
                    className="glass-button-secondary px-5 py-2.5 text-sm font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="glass-button-primary px-5 py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    {saving ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
