import React, { useEffect, useMemo, useState } from "react";
import { PencilSquareIcon, PlusIcon, PowerIcon, ShieldCheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  createManagedRole, getManagedRoles, updateManagedRole, updateManagedRoleStatus,
  type ManagedRole,
} from "@/src/lib/api";

export const RolesManagementView: React.FC = () => {
  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(true);
  const [editing, setEditing] = useState<ManagedRole | "new" | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getManagedRoles().then(setRoles).catch((e: unknown) =>
      setError(e instanceof Error ? e.message : "No se pudieron cargar los roles")
    ).finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const text = query.trim().toLowerCase();
    return roles.filter((role) => role.is_active === active).filter((role) =>
      !text || [role.name, role.code, role.category].some((value) =>
        String(value ?? "").toLowerCase().includes(text)
      )
    );
  }, [active, query, roles]);

  const open = (role: ManagedRole | "new") => {
    setEditing(role);
    setName(role === "new" ? "" : role.name);
    setCode(role === "new" ? "" : role.code ?? "");
    setError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true); setError(null);
    try {
      const saved = editing === "new"
        ? await createManagedRole(name.trim(), code.trim())
        : editing ? await updateManagedRole(editing.id, name.trim(), code.trim()) : null;
      if (!saved) return;
      setRoles((current) => (editing === "new"
        ? [...current, saved]
        : current.map((role) => role.id === saved.id ? saved : role)
      ).sort((a, b) => a.name.localeCompare(b.name)));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el rol");
    } finally { setSaving(false); }
  };

  const toggle = async (role: ManagedRole) => {
    if (role.is_active && role.assigned_count > 0) {
      setError("ROL ASIGNADO, NO SE PUEDE INHABILITAR"); return;
    }
    setSaving(true); setError(null);
    try {
      const saved = await updateManagedRoleStatus(role.id, !role.is_active);
      setRoles((current) => current.map((item) => item.id === saved.id ? saved : item));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar el estado");
    } finally { setSaving(false); }
  };

  return <section className="space-y-6">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-orbit-primary">Administración</p>
        <h1 className="mt-2 font-display text-3xl font-semibold text-orbit-text">Gestión de roles</h1>
        <p className="mt-1 text-sm text-orbit-muted">Administra los nombres y códigos del catálogo institucional.</p></div>
      <div className="flex items-center gap-2 text-sm text-orbit-muted"><ShieldCheckIcon className="h-5 w-5 text-orbit-primary" />{roles.length} roles registrados</div>
    </header>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="inline-flex w-fit rounded-2xl bg-orbit-bg-secondary p-1">
        {[true, false].map((value) => <button key={String(value)} type="button" onClick={() => setActive(value)} className={`rounded-xl px-5 py-2 text-sm font-semibold ${active === value ? "bg-orbit-elevated text-orbit-text shadow-sm" : "text-orbit-muted"}`}>{value ? "Activos" : "Inactivos"}</button>)}
      </div>
      <button type="button" onClick={() => open("new")} className="glass-button-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm"><PlusIcon className="h-4 w-4" />Crear rol</button>
    </div>
    <div className="glass-panel overflow-hidden">
      <div className="border-b border-orbit-border p-4"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar por nombre, código o categoría" className="w-full rounded-lg border border-orbit-border bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text outline-none focus:border-orbit-primary" /></div>
      {error && <p className="border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</p>}
      {loading ? <p className="p-8 text-center text-sm text-orbit-muted">Cargando roles...</p> : visible.length === 0 ? <p className="p-8 text-center text-sm text-orbit-muted">No hay roles en esta sección.</p> :
        <div className="divide-y divide-orbit-border">{visible.map((role) => <div key={role.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium text-orbit-text">{role.name}</p><p className="mt-1 text-xs text-orbit-muted">{role.code || "Sin código"}{role.category ? ` · ${role.category}` : ""} · ID {role.id}</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => open(role)} className="glass-button-secondary inline-flex items-center gap-2 px-3 py-2 text-xs"><PencilSquareIcon className="h-4 w-4" />Editar</button>
            <button type="button" onClick={() => void toggle(role)} disabled={saving || (role.is_active && role.assigned_count > 0)} className="inline-flex items-center gap-2 rounded-lg border border-orbit-border px-3 py-2 text-xs text-orbit-muted disabled:opacity-40"><PowerIcon className="h-4 w-4" />{role.is_active ? "Inhabilitar" : "Habilitar"}</button></div>
        </div>)}</div>}
    </div>
    {editing && <div className="fixed inset-0 z-120 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-orbit-border bg-orbit-bg-secondary p-5 shadow-2xl">
        <div className="flex justify-between"><h2 className="font-display text-xl font-semibold text-orbit-text">{editing === "new" ? "Crear rol" : "Editar rol"}</h2><button type="button" onClick={() => setEditing(null)}><XMarkIcon className="h-5 w-5" /></button></div>
        <form onSubmit={save} className="mt-5 space-y-4"><label className="block text-sm text-orbit-text">Nombre del rol<input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={150} className="mt-1.5 w-full rounded-lg border border-orbit-border bg-orbit-bg px-3 py-2.5" /></label>
          <label className="block text-sm text-orbit-text">Código<input value={code} onChange={(e) => setCode(e.target.value)} maxLength={50} className="mt-1.5 w-full rounded-lg border border-orbit-border bg-orbit-bg px-3 py-2.5" /></label>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="glass-button-secondary px-4 py-2.5 text-sm">Cancelar</button><button type="submit" disabled={saving || !name.trim()} className="glass-button-primary px-4 py-2.5 text-sm disabled:opacity-50">{saving ? "Guardando..." : "Guardar"}</button></div>
        </form>
      </div>
    </div>}
  </section>;
};
