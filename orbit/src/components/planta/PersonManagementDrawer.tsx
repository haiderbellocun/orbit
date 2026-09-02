import React from 'react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/solid';
import { cn } from '@/src/lib/utils';
import type { OrgChartGraphPayload, PlantaPerson } from '@/src/types';
import type {
  CatalogArea,
  CatalogProgram,
  CatalogRole,
  CatalogSchool,
} from '@/src/lib/api';
import { PLANTA_SELECT_CLASS, roleSkipsAutoVacancy } from '@/src/lib/plantaMappers';
import {
  canHaveDirectReports,
  personInitials,
} from '@/src/lib/roleHierarchy';
import { findCoordinatorAndLeader, directReportsOf } from '@/src/lib/organizationTree';

export type PlantaEditForm = {
  full_name: string;
  document: string;
  email: string;
  edu_email: string;
  phone: string;
  address: string;
  area_id: string;
  school_id: string;
  program_id: string;
  role_id: string;
  is_active: boolean;
  create_vacancy: boolean;
};

type PersonManagementDrawerProps = {
  mode: 'create' | 'edit';
  person: PlantaPerson | null;
  people: PlantaPerson[];
  form: PlantaEditForm;
  setForm: React.Dispatch<React.SetStateAction<PlantaEditForm>>;
  areas: CatalogArea[];
  schools: CatalogSchool[];
  programs: CatalogProgram[];
  roles: CatalogRole[];
  areaRequired: boolean;
  showEmptyAreaOption: boolean;
  saving: boolean;
  formError: string | null;
  onClose: () => void;
  onSave: (e: React.FormEvent) => void;
  onAssign: () => void;
  onChangeManager: () => void;
  onManageReport: (personId: string) => void;
  onRemoveReport: (person: PlantaPerson) => void;
  canEditPerson: boolean;
  graph: OrgChartGraphPayload | null;
  canMutateOrg: boolean;
};

export const PersonManagementDrawer: React.FC<PersonManagementDrawerProps> = ({
  mode,
  person,
  people,
  form,
  setForm,
  areas,
  schools,
  programs,
  roles,
  areaRequired,
  showEmptyAreaOption,
  saving,
  formError,
  onClose,
  onSave,
  onAssign,
  onChangeManager,
  onManageReport,
  onRemoveReport,
  canEditPerson,
  graph,
  canMutateOrg,
}) => {
  const selectedRoleName = roles.find((r) => String(r.id) === form.role_id)?.name;
  const inactivating =
    mode === 'edit' && person?.status === 'active' && !form.is_active;
  const skipsAutoVacancy = roleSkipsAutoVacancy(selectedRoleName);
  const teamCapable = canHaveDirectReports({
    roleName: selectedRoleName || person?.role_name,
    roleCode: person?.role_code,
  });
  const reports = person
    ? directReportsOf(person.id, people, graph)
    : [];
  const hierarchy = person
    ? findCoordinatorAndLeader(people, person, graph)
    : { coordinator: null, leader: null };
  const leaderCount = reports.filter((p) =>
    canHaveDirectReports({ roleName: p.role_name, roleCode: p.role_code })
  ).length;

  return (
    <div className="fixed inset-0 z-[200] flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/50"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <aside
        className="relative flex h-full w-full max-w-lg flex-col bg-orbit-surface shadow-xl border-l border-orbit-border"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-orbit-border px-5 py-4">
          <div>
            <h3 className="text-lg font-display font-bold text-orbit-text">
              {mode === 'create' ? 'Nueva persona' : 'Gestionar persona'}
            </h3>
            <p className="text-sm text-orbit-muted mt-0.5">
              {mode === 'create'
                ? 'Registra una persona en planta activa'
                : person?.name}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-orbit-interactive text-orbit-muted"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            <section className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                Información personal
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Nombre completo
                  </span>
                  <input
                    value={form.full_name}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, full_name: e.target.value }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    required
                    disabled={!canEditPerson}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Identificación
                  </span>
                  <input
                    value={form.document}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, document: e.target.value }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    required={mode === 'create'}
                    disabled={
                      !canEditPerson ||
                      (mode === 'edit' && Boolean(person?.document?.trim()))
                    }
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Teléfono
                  </span>
                  <input
                    value={form.phone}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, phone: e.target.value }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    disabled={!canEditPerson}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Correo personal
                  </span>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    disabled={!canEditPerson}
                  />
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Correo institucional
                  </span>
                  <input
                    type="email"
                    value={form.edu_email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, edu_email: e.target.value }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    disabled={!canEditPerson}
                  />
                </label>
                <label className="space-y-1.5 sm:col-span-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Dirección
                  </span>
                  <input
                    value={form.address}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, address: e.target.value }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    disabled={!canEditPerson}
                  />
                </label>
                <label className="inline-flex items-start gap-2 text-sm text-orbit-text-secondary sm:col-span-2 pt-1">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        is_active: e.target.checked,
                        create_vacancy: e.target.checked
                          ? f.create_vacancy
                          : true,
                      }))
                    }
                    disabled={!canEditPerson}
                    className="mt-0.5 rounded border-orbit-border text-orbit-primary focus:ring-violet-400"
                  />
                  <span>
                    <span className="font-semibold">Persona activa</span>
                    <span className="block text-xs text-orbit-muted mt-0.5">
                      {mode === 'edit'
                        ? 'Al desactivar se mueve a Inactivos.'
                        : 'Por defecto queda en la pestaña de Activos.'}
                    </span>
                  </span>
                </label>
                {inactivating && skipsAutoVacancy && (
                  <p className="text-xs text-orbit-muted sm:col-span-2">
                    Para roles DOCENTE, LIDER o LITE no se crea vacante
                    automática.
                  </p>
                )}
                {inactivating && !skipsAutoVacancy && (
                  <label className="inline-flex items-start gap-2 text-sm text-orbit-text-secondary sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={form.create_vacancy}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          create_vacancy: e.target.checked,
                        }))
                      }
                      className="mt-0.5 rounded border-orbit-border text-orbit-primary focus:ring-violet-400"
                    />
                    <span>
                      <span className="font-semibold">
                        Crear vacante automáticamente
                      </span>
                      <span className="block text-xs text-orbit-muted mt-0.5">
                        Activo por defecto. Desmárcalo si solo quieres inactivar
                        sin abrir vacante.
                      </span>
                    </span>
                  </label>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                Estructura organizacional
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Área
                  </span>
                  <select
                    value={form.area_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        area_id: e.target.value,
                        school_id: '',
                        program_id: '',
                      }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    required={areaRequired}
                    disabled={!canEditPerson}
                  >
                    {showEmptyAreaOption && <option value="">Sin área</option>}
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Escuela
                  </span>
                  <select
                    value={form.school_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        school_id: e.target.value,
                        program_id: '',
                      }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    disabled={!canEditPerson}
                  >
                    <option value="">Sin escuela</option>
                    {schools.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Programa
                  </span>
                  <select
                    value={form.program_id}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        program_id: e.target.value,
                      }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    disabled={!canEditPerson}
                  >
                    <option value="">Sin programa</option>
                    {programs.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Rol
                  </span>
                  <select
                    value={form.role_id}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, role_id: e.target.value }))
                    }
                    className={PLANTA_SELECT_CLASS}
                    disabled={!canEditPerson}
                  >
                    <option value="">Sin rol</option>
                    {roles.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            {mode === 'edit' && person && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Jerarquía
                  </h4>
                  {canEditPerson && canMutateOrg && (
                    <button
                      type="button"
                      onClick={onChangeManager}
                      className="text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
                    >
                      Cambiar responsable
                    </button>
                  )}
                </div>
                <dl className="rounded-xl border border-orbit-border divide-y divide-orbit-border text-sm">
                  <div className="flex justify-between gap-3 px-3 py-2.5">
                    <dt className="text-orbit-muted">Responsable directo</dt>
                    <dd className="text-right font-semibold text-orbit-text">
                      {person.manager_name || 'Sin asignar'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 px-3 py-2.5">
                    <dt className="text-orbit-muted">Coordinador</dt>
                    <dd className="text-right text-orbit-text">
                      {hierarchy.coordinator?.name || '—'}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 px-3 py-2.5">
                    <dt className="text-orbit-muted">Líder / LITE</dt>
                    <dd className="text-right text-orbit-text">
                      {hierarchy.leader?.name || '—'}
                    </dd>
                  </div>
                </dl>
              </section>
            )}

            {mode === 'edit' && teamCapable && person && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                    Equipo a cargo
                  </h4>
                  {canEditPerson && canMutateOrg && (
                    <button
                      type="button"
                      onClick={onAssign}
                      className="inline-flex items-center gap-1 text-xs font-bold text-orbit-primary hover:text-orbit-primary-hover"
                    >
                      <PlusIcon className="h-3.5 w-3.5" />
                      Asignar colaboradores
                    </button>
                  )}
                </div>
                <p className="text-sm text-orbit-text-secondary">
                  {leaderCount} líder{leaderCount === 1 ? '' : 'es'} ·{' '}
                  {reports.length} colaborador
                  {reports.length === 1 ? '' : 'es'}
                </p>
                {reports.length === 0 ? (
                  <p className="text-sm text-orbit-muted">
                    Aún no hay personas asignadas a este responsable.
                  </p>
                ) : (
                  <ul className="divide-y divide-orbit-border rounded-xl border border-orbit-border">
                    {reports.map((report) => (
                      <li
                        key={report.id}
                        className="flex items-center gap-3 px-3 py-2.5"
                      >
                        <span className="h-8 w-8 shrink-0 rounded-lg bg-orbit-interactive text-orbit-text-secondary flex items-center justify-center text-[11px] font-bold">
                          {personInitials(report.name)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-orbit-text">
                            {report.name}
                          </span>
                          <span className="block truncate text-xs text-orbit-muted">
                            {report.role_name || 'Sin rol'}
                          </span>
                        </span>
                        {canEditPerson && canMutateOrg && (
                          <div className="flex shrink-0 gap-2">
                            <button
                              type="button"
                              onClick={() => onManageReport(report.id)}
                              className="text-xs font-bold text-orbit-primary"
                            >
                              Gestionar
                            </button>
                            <button
                              type="button"
                              onClick={() => onRemoveReport(report)}
                              className="text-xs font-bold text-orbit-danger"
                            >
                              Quitar
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>

          {formError && (
            <p className="px-5 text-sm text-orbit-danger font-medium">{formError}</p>
          )}

          <div className="flex justify-end gap-3 border-t border-orbit-border px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="glass-button-secondary px-5 py-2.5 text-sm font-bold"
            >
              Cancelar
            </button>
            {canEditPerson && (
              <button
                type="submit"
                disabled={saving}
                className={cn(
                  'glass-button-primary px-5 py-2.5 text-sm font-bold disabled:opacity-50'
                )}
              >
                {saving
                  ? mode === 'create'
                    ? 'Creando…'
                    : 'Guardando…'
                  : mode === 'create'
                    ? 'Crear'
                    : 'Guardar'}
              </button>
            )}
          </div>
        </form>
      </aside>
    </div>
  );
};
