import React, { useEffect, useMemo, useState } from "react";
import {
  PencilSquareIcon,
  PlusIcon,
  PowerIcon,
  ShieldCheckIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  createManagedRole,
  getManagedRoles,
  updateManagedRole,
  updateManagedRoleStatus,
  type ManagedRole,
} from "@/src/lib/api";

type RoleStatus = "active" | "inactive";

export const RolesManagementView: React.FC = () => {
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<RoleStatus>("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [selectedRole, setSelectedRole] = useState<ManagedRole | null>(null);
  const [formName, setFormName] = useState("");
  const [formCode, setFormCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getManagedRoles()
      .then(setRoles)
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : "No se pudieron cargar los roles")
      )
      .finally(() => setLoading(false));
  }, []);

  const visibleRoles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return roles
      .filter((role) => (status === "active" ? role.is_active : !role.is_active))
      .filter((role) => {
        if (!normalized) return true;
        return [role.name, role.code, role.category].some((value) =>
          String(value ?? "").toLowerCase().includes(normalized)
        );
      });
  }, [query, roles, status]);

  const openCreateModal = () => {
    setSelectedRole(null);
    setFormName("");
    setFormCode("");
    setError(null);
    setModalMode("create");
  };

  const openEditModal = (role: ManagedRole) => {
    setSelectedRole(role);
    setFormName(role.name);
    setFormCode(role.code ?? "");
    setError(null);
    setModalMode("edit");
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
    setSelectedRole(null);
  };

  const saveRole = async (event: React.FormEvent) => {
    event.preventDefault();
    const name = formName.trim();
    const code = formCode.trim();
    if (!name) return;
    setSaving(true);
    setError(null);
    try {
      const saved = modalMode === "create"
        ? await createManagedRole(name, code)
        : selectedRole
          ? await updateManagedRole(selectedRole.id, name, code)
          : null;
      if (!saved) return;
      setRoles((current) => {
        const next = modalMode === "create"
          ? [...current, saved]
          : current.map((role) => (role.id === saved.id ? saved : role));
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
      closeModal();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo guardar el rol");
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (role: ManagedRole) => {
    const nextStatus = !role.is_active;
    if (!nextStatus && role.assigned_count > 0) {
      setError("ROL ASIGNADO, NO SE PUEDE INHABILITAR");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await updateManagedRoleStatus(role.id, nextStatus);
      setRoles((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo actualizar el estado del rol");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orbit-primary">Administración</p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-orbit-text">Gestión de roles</h1>
          <p className="mt-1 text-sm text-orbit-muted">Administra los nombres y códigos del catálogo institucional.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-orbit-muted">
          <ShieldCheckIcon className="h-5 w-5 text-orbit-primary" />
          {roles.length} roles registrados
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex w-fit rounded-2xl bg-orbit-bg-secondary p-1">
          {(["active", "inactive"] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStatus(item)}
              className={`rounded-xl px-5 py-2 text-sm font-semibold transition ${
                status === item
                  ? "bg-orbit-elevated text-orbit-text shadow-sm"
                  : "text-orbit-muted hover:text-orbit-text"
              }`}
            >
              {item === "active" ? "Activos" : "Inactivos"}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="glass-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm"
        >
          <PlusIcon className="h-4 w-4" /> Crear rol
        </button>
      </div>

      <div className="glass-panel overflow-hidden">
        <div className="border-b border-orbit-border p-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nombre, código o categoría"
            className="w-full rounded-lg border border-orbit-border bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text outline-none focus:border-orbit-primary"
          />
        </div>
        {error && <p className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
        {loading ? (
          <p className="p-8 text-center text-sm text-orbit-muted">Cargando roles...</p>
        ) : visibleRoles.length === 0 ? (
          <p className="p-8 text-center text-sm text-orbit-muted">No hay roles en esta sección.</p>
        ) : (
          <div className="divide-y divide-orbit-border">
            {visibleRoles.map((role) => {
              const assigned = role.assigned_count > 0;
              return (
                <div key={role.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-orbit-text">{role.name}</p>
                    <p className="mt-1 text-xs text-orbit-muted">
                      {role.code || "Sin código"}{role.category ? ` · ${role.category}` : ""} · ID {role.id}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {assigned && status === "active" && (
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-300">ROL ASIGNADO</span>
                    )}
                    <button
                      type="button"
                      onClick={() => openEditModal(role)}
                      className="glass-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"
                    >
                      <PencilSquareIcon className="h-4 w-4" /> Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => void changeStatus(role)}
                      disabled={saving || (status === "active" && assigned)}
                      title={status === "active" && assigned ? "ROL ASIGNADO, NO SE PUEDE INHABILITAR" : undefined}
                      className="inline-flex items-center gap-2 rounded-lg border border-orbit-border px-3 py-2 text-xs text-orbit-muted transition hover:bg-orbit-interactive hover:text-orbit-text disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <PowerIcon className="h-4 w-4" /> {status === "active" ? "Inhabilitar" : "Habilitar"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modalMode && (
        <div
          className="fixed inset-0 z-120 flex items-center justify-center bg-black/60 p-4"
          role="presentation"
          onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal(); }}
        >
          <div className="w-full max-w-lg rounded-2xl border border-orbit-border bg-orbit-bg-secondary p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="role-modal-title">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="role-modal-title" className="font-display text-xl font-semibold text-orbit-text">
                  {modalMode === "create" ? "Crear rol" : "Editar rol"}
                </h2>
                <p className="mt-1 text-sm text-orbit-muted">Completa el nombre y el código del cargo.</p>
              </div>
              <button type="button" onClick={closeModal} disabled={saving} className="rounded-lg p-2 text-orbit-muted hover:bg-orbit-interactive hover:text-orbit-text" aria-label="Cerrar modal">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveRole} className="mt-5 space-y-4">
              <label className="block text-sm text-orbit-text">
                Nombre del rol
                <input autoFocus value={formName} onChange={(event) => setFormName(event.target.value)} maxLength={150} className="mt-1.5 w-full rounded-lg border border-orbit-border bg-orbit-bg px-3 py-2.5 text-sm outline-none focus:border-orbit-primary" />
              </label>
              <label className="block text-sm text-orbit-text">
                Código
                <input value={formCode} onChange={(event) => setFormCode(event.target.value)} maxLength={50} placeholder="Opcional" className="mt-1.5 w-full rounded-lg border border-orbit-border bg-orbit-bg px-3 py-2.5 text-sm outline-none focus:border-orbit-primary" />
              </label>
              {error && <p className="text-sm text-red-300">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeModal} disabled={saving} className="glass-button-secondary px-4 py-2.5 text-sm">Cancelar</button>
                <button type="submit" disabled={saving || !formName.trim()} className="glass-button-primary px-4 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-50">{saving ? "Guardando..." : "Guardar"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
};
