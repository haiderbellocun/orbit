import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftIcon, ArrowUpTrayIcon, CheckCircleIcon, ChevronLeftIcon, ChevronRightIcon,
  DocumentIcon, ExclamationTriangleIcon, FolderIcon, MagnifyingGlassIcon, PlusIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  archiveInformationProject, archiveInformationTask, createInformationIncident, createInformationProject, createInformationTask,
  downloadInformationEvidence, getCatalogAreas, getInformationEvidence,
  getInformationAudit, getInformationProject, getInformationProjects, getInformationTask, getInformationTasks,
  updateInformationIncident, updateInformationProject, updateInformationTask,
  uploadInformationEvidence, voidInformationEvidence, type CatalogArea, type InformationAuditEntry, type InformationEvidence,
  type InformationIncident, type InformationProject, type InformationTask, type InformationTaskDetail,
} from "@/src/lib/api";

const PROJECT_STATUS = { pending: "Pendiente", in_progress: "En proceso", completed: "Completado", cancelled: "Cancelado" } as const;
const REVIEW_STATUS = { unreviewed: "Sin revisar", pending_correction: "Pendiente de corrección", correct: "Correcta" } as const;
const PRIORITY = { low: "Baja", medium: "Media", high: "Alta", critical: "Crítica" } as const;
const auditActionLabel = (action: string) => ({ created: "Creada", updated: "Actualizada", archived: "Archivada", restored: "Restaurada", resolved: "Resuelta", reopened: "Reabierta", voided: "Anulada" }[action] ?? action);
type Screen = { type: "projects" } | { type: "project"; id: string } | { type: "task"; id: string; projectId: string };
type Modal = "project" | "task" | "subtask" | "incident" | "evidence" | null;

const nowLocalInput = () => {
  const date = new Date(); date.setMinutes(date.getMinutes() - date.getTimezoneOffset()); return date.toISOString().slice(0, 16);
};

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 p-4" onMouseDown={onClose}>
    <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-orbit-border bg-white shadow-2xl dark:bg-orbit-surface" onMouseDown={(event) => event.stopPropagation()}>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-orbit-border bg-white px-5 py-4 dark:bg-orbit-surface">
        <h2 className="font-display text-lg font-semibold">{title}</h2><button className="rounded-lg p-2 hover:bg-orbit-interactive" onClick={onClose}><XMarkIcon className="h-5 w-5" /></button>
      </div><div className="p-5">{children}</div>
    </div>
  </div>;
}

const Field = ({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) => <label className={`block ${wide ? "sm:col-span-2" : ""}`}><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.08em] text-orbit-muted">{label}</span>{children}</label>;
const Empty = ({ text }: { text: string }) => <div className="rounded-xl border border-dashed border-orbit-border px-6 py-12 text-center text-sm text-orbit-muted">{text}</div>;
const ErrorBanner = ({ text }: { text: string }) => text ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{text}</div> : null;

export const InformationManagementView: React.FC = () => {
  const [screen, setScreen] = useState<Screen>({ type: "projects" });
  const [modal, setModal] = useState<Modal>(null);
  const [areas, setAreas] = useState<CatalogArea[]>([]);
  const [projects, setProjects] = useState<InformationProject[]>([]);
  const [project, setProject] = useState<InformationProject | null>(null);
  const [tasks, setTasks] = useState<InformationTask[]>([]);
  const [task, setTask] = useState<InformationTaskDetail | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<InformationIncident | null>(null);
  const [evidence, setEvidence] = useState<InformationEvidence[]>([]);
  const [history, setHistory] = useState<InformationAuditEntry[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [reviewFilter, setReviewFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true); setError("");
    try { const response = await getInformationProjects({ page, limit: 12, search, status: statusFilter, area_id: areaFilter ? Number(areaFilter) : undefined }); setProjects(response.data); setPages(Math.max(1, response.pagination.totalPages)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible cargar los proyectos"); }
    finally { setLoading(false); }
  }, [page, search, statusFilter, areaFilter]);

  const loadProject = useCallback(async (id: string) => {
    setLoading(true); setError("");
    try { const [projectData, taskData] = await Promise.all([getInformationProject(id), getInformationTasks(id, { page, limit: 20, search, review_status: reviewFilter })]); setProject(projectData); setTasks(taskData.data); setPages(Math.max(1, taskData.pagination.totalPages)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible cargar el proyecto"); }
    finally { setLoading(false); }
  }, [page, search, reviewFilter]);

  const loadTask = useCallback(async (id: string) => {
    setLoading(true); setError(""); try { const [detail, audit] = await Promise.all([getInformationTask(id), getInformationAudit("task", id)]); setTask(detail); setHistory(audit); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible cargar la tarea"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void getCatalogAreas().then(setAreas).catch(() => setAreas([])); }, []);
  useEffect(() => { const timer = window.setTimeout(() => { if (screen.type === "projects") void loadProjects(); else if (screen.type === "project") void loadProject(screen.id); }, 250); return () => window.clearTimeout(timer); }, [screen, loadProjects, loadProject]);
  useEffect(() => { if (screen.type === "task") void loadTask(screen.id); }, [screen, loadTask]);

  const navigate = (next: Screen) => { setPage(1); setSearch(""); setStatusFilter(""); setAreaFilter(""); setReviewFilter(""); setError(""); setScreen(next); };
  const openEvidence = async (incident: InformationIncident) => { setSelectedIncident(incident); setEvidence(await getInformationEvidence(incident.id)); setModal("evidence"); };

  if (screen.type === "projects") return <>
    <Header title="Gestión de información" subtitle="Control de proyectos, tareas e incidencias registradas en Zoho" action={<button className="glass-button-primary" onClick={() => setModal("project")}><PlusIcon className="h-4 w-4" />Nuevo proyecto</button>} />
    <ErrorBanner text={error} />
    <div className="mb-6 grid gap-3 rounded-2xl border border-orbit-border bg-white p-4 shadow-sm dark:bg-orbit-surface md:grid-cols-[1fr_220px_220px]">
      <Search value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar proyecto, ID o propietario..." />
      <select className="glass-input" value={areaFilter} onChange={(event) => { setAreaFilter(event.target.value); setPage(1); }}><option value="">Todas las áreas</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select>
      <select className="glass-input" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}><option value="">Todos los estados</option>{Object.entries(PROJECT_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
    </div>
    {loading ? <Empty text="Cargando proyectos..." /> : projects.length === 0 ? <Empty text="No hay proyectos que coincidan con los filtros." /> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{projects.map((item) => <button key={item.id} className="group relative overflow-hidden rounded-2xl border border-orbit-border bg-white p-5 text-left shadow-sm transition-all duration-200 hover:-translate-y-1 hover:border-violet-200 hover:shadow-xl hover:shadow-violet-100/60 dark:bg-orbit-surface dark:hover:border-violet-500/50 dark:hover:shadow-violet-950/30" onClick={() => navigate({ type: "project", id: item.id })}>
      <span className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-violet-500 via-fuchsia-400 to-cyan-400 opacity-70" />
      <div className="mb-4 flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-50 text-violet-600 ring-1 ring-violet-100 transition-transform group-hover:scale-105"><FolderIcon className="h-5 w-5" /></span><StatusPill value={item.status} labels={PROJECT_STATUS} /></div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-violet-500">Proyecto #{item.public_id}</div>
      <h3 className="line-clamp-2 font-display text-lg font-semibold text-orbit-text transition-colors group-hover:text-violet-700">{item.name}</h3><p className="mt-1 text-sm text-orbit-muted">{item.area_name}</p>
      {item.description && <p className="mt-3 line-clamp-2 text-sm text-orbit-text-secondary">{item.description}</p>}
      <div className="mt-5 grid grid-cols-2 gap-3 border-t border-orbit-border pt-4 text-sm"><div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-orbit-interactive"><span className="block text-[11px] font-medium uppercase tracking-wide text-orbit-muted">Tareas</span><strong className="mt-0.5 block text-lg">{item.task_count ?? 0}</strong></div><div className="rounded-xl bg-slate-50 px-3 py-2 dark:bg-orbit-interactive"><span className="block text-[11px] font-medium uppercase tracking-wide text-orbit-muted">Por corregir</span><strong className={`mt-0.5 block text-lg ${(item.pending_task_count ?? 0) > 0 ? "text-orbit-danger" : "text-orbit-success"}`}>{item.pending_task_count ?? 0}</strong></div></div>
    </button>)}</div>}
    <Pagination page={page} pages={pages} onPage={setPage} />
    {modal === "project" && <ProjectForm areas={areas} saving={saving} onClose={() => setModal(null)} onSave={async (data) => { setSaving(true); setError(""); try { await createInformationProject(data); setModal(null); await loadProjects(); } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible crear"); } finally { setSaving(false); } }} />}
  </>;

  if (screen.type === "project") return <>
    <button className="mb-4 flex items-center gap-2 text-sm font-medium text-orbit-muted hover:text-orbit-text" onClick={() => navigate({ type: "projects" })}><ArrowLeftIcon className="h-4 w-4" />Proyectos</button>
    <Header title={project?.name ?? "Proyecto"} subtitle={project ? `${project.area_name} · ${project.zoho_owner_name || "Sin propietario registrado"}` : "Cargando..."} action={<div className="flex flex-wrap gap-2"><button className="glass-button-secondary" onClick={() => setModal("project")}>Editar</button><button className="glass-button-secondary text-orbit-danger" onClick={async () => { if (!project) return; const reason = window.prompt("Motivo para archivar el proyecto:"); if (!reason?.trim()) return; await archiveInformationProject(project.id, reason.trim()); navigate({ type: "projects" }); }}>Archivar</button><button className="glass-button-primary" onClick={() => setModal("task")}><PlusIcon className="h-4 w-4" />Nueva tarea</button></div>} />
    <ErrorBanner text={error} />
    {project && <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Estado" value={PROJECT_STATUS[project.status]} /><Metric label="ID de Zoho" value={project.zoho_project_id || "No registrado"} /><Metric label="Inicio" value={project.start_date || "Sin fecha"} /><Metric label="Finalización" value={project.end_date || "Sin fecha"} /></div>}
    <div className="mb-4 flex flex-col gap-3 sm:flex-row"><Search value={search} onChange={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar tarea o ID de Zoho..." /><select className="glass-input sm:max-w-[240px]" value={reviewFilter} onChange={(event) => { setReviewFilter(event.target.value); setPage(1); }}><option value="">Todas las revisiones</option>{Object.entries(REVIEW_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
    <div className="overflow-x-auto rounded-2xl border border-orbit-border bg-white shadow-sm dark:bg-orbit-surface"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-gradient-to-r from-slate-50 to-violet-50/60 text-[11px] uppercase tracking-[0.1em] text-orbit-muted dark:from-orbit-interactive dark:to-violet-950/30"><tr><th className="px-5 py-4">Tarea</th><th className="px-4 py-4">Zoho</th><th className="px-4 py-4">Estado</th><th className="px-4 py-4">Revisión</th><th className="px-4 py-4">Prioridad</th><th className="px-4 py-4">Vence</th><th className="px-4 py-4">Incidencias</th></tr></thead><tbody className="divide-y divide-orbit-border">{tasks.map((item) => <tr key={item.id} className="cursor-pointer transition-colors hover:bg-violet-50/50 dark:hover:bg-violet-950/20" onClick={() => navigate({ type: "task", id: item.id, projectId: screen.id })}><td className="px-5 py-4 font-medium"><span className="mb-0.5 block text-[10px] font-semibold uppercase tracking-wider text-violet-500">Tarea #{item.public_id}</span>{item.name}<span className="block text-xs font-normal text-orbit-muted">{item.subtask_count ?? 0} subtareas</span></td><td className="px-4 py-4 text-orbit-muted">{item.zoho_task_id || "—"}</td><td className="px-4 py-4"><StatusPill value={item.zoho_status} labels={PROJECT_STATUS} /></td><td className="px-4 py-4"><ReviewPill value={item.review_status} /></td><td className="px-4 py-4">{PRIORITY[item.priority]}</td><td className="px-4 py-4">{item.due_date || "—"}</td><td className="px-4 py-4"><span className={`inline-flex min-w-7 justify-center rounded-full px-2 py-1 text-xs font-semibold ${(item.active_incident_count ?? 0) > 0 ? "bg-red-50 text-orbit-danger dark:bg-red-950/30" : "bg-slate-100 text-orbit-muted dark:bg-orbit-interactive"}`}>{item.active_incident_count ?? 0}</span></td></tr>)}</tbody></table>{!loading && tasks.length === 0 && <Empty text="Este proyecto todavía no tiene tareas." />}</div>
    <Pagination page={page} pages={pages} onPage={setPage} />
    {modal === "project" && project && <ProjectForm initial={project} areas={areas} saving={saving} onClose={() => setModal(null)} onSave={async (data) => { setSaving(true); try { await updateInformationProject(project.id, data); setModal(null); await loadProject(project.id); } finally { setSaving(false); } }} />}
    {modal === "task" && project && <TaskForm inheritedOwner={project.zoho_owner_name} saving={saving} onClose={() => setModal(null)} onSave={async (data) => { setSaving(true); try { await createInformationTask(project.id, data); setModal(null); await loadProject(project.id); } finally { setSaving(false); } }} />}
  </>;

  return <>
    <button className="mb-4 flex items-center gap-2 text-sm font-medium text-orbit-muted hover:text-orbit-text" onClick={() => navigate({ type: "project", id: screen.projectId })}><ArrowLeftIcon className="h-4 w-4" />Volver al proyecto</button>
    <Header title={task?.name ?? "Tarea"} subtitle={task ? `${task.project_name} · ${task.zoho_task_id || "Sin ID de Zoho"}` : "Cargando..."} action={<div className="flex flex-wrap gap-2"><button className="glass-button-secondary" onClick={() => setModal("task")}>Editar</button><button className="glass-button-secondary text-orbit-danger" onClick={async () => { if (!task) return; const reason = window.prompt("Motivo para archivar la tarea:"); if (!reason?.trim()) return; await archiveInformationTask(task.id, reason.trim()); navigate({ type: "project", id: screen.projectId }); }}>Archivar</button><button className="glass-button-primary" onClick={() => setModal("incident")}><PlusIcon className="h-4 w-4" />Nueva incidencia</button></div>} />
    <ErrorBanner text={error} />
    {task && <><div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Estado en Zoho" value={PROJECT_STATUS[task.zoho_status]} /><Metric label="Revisión Orbit" value={REVIEW_STATUS[task.review_status]} /><Metric label="Cumplimiento" value={`${task.completion_percentage}%`} /><Metric label="Prioridad" value={PRIORITY[task.priority]} /></div>
      {task.description && <section className="mb-6 rounded-2xl border border-violet-100 bg-gradient-to-br from-white to-violet-50/50 p-5 shadow-sm dark:border-violet-900/50 dark:from-orbit-surface dark:to-violet-950/20"><h3 className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-500 dark:text-violet-300">Descripción</h3><p className="whitespace-pre-wrap text-sm leading-relaxed text-orbit-text-secondary">{task.description}</p></section>}
      <section className="mb-6"><div className="mb-3 flex items-center justify-between"><h2 className="font-display text-lg font-semibold">Subtareas</h2><button className="glass-button-secondary text-sm" onClick={() => setModal("subtask")}><PlusIcon className="h-4 w-4" />Agregar</button></div>{task.subtasks.length === 0 ? <Empty text="No hay subtareas." /> : <div className="grid gap-3 sm:grid-cols-2">{task.subtasks.map((subtask) => <button key={subtask.id} className="glass-card p-4 text-left" onClick={() => navigate({ type: "task", id: subtask.id, projectId: screen.projectId })}><div className="flex justify-between gap-3"><strong>{subtask.name}</strong><ReviewPill value={subtask.review_status} /></div><p className="mt-2 text-xs text-orbit-muted">{subtask.due_date ? `Vence ${subtask.due_date}` : "Sin vencimiento"}</p></button>)}</div>}</section>
      <section><h2 className="mb-3 font-display text-lg font-semibold">Incidencias</h2>{task.incidents.length === 0 ? <Empty text="No se han registrado incidencias." /> : <div className="space-y-3">{task.incidents.map((incident) => <div key={incident.id} className={`relative overflow-hidden rounded-2xl border bg-white p-5 shadow-sm ${incident.status === "active" ? "border-red-200" : "border-emerald-200"}`}><span className={`absolute inset-y-0 left-0 w-1 ${incident.status === "active" ? "bg-red-400" : "bg-emerald-400"}`} /><div className="flex flex-col justify-between gap-4 sm:flex-row"><div className="pl-1"><div className="mb-2 flex flex-wrap items-center gap-2">{incident.status === "active" ? <ExclamationTriangleIcon className="h-5 w-5 text-orbit-danger" /> : <CheckCircleIcon className="h-5 w-5 text-orbit-success" />}<strong>{incident.status === "active" ? "Incidencia activa" : "Incidencia resuelta"}</strong><span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">#{incident.public_id}</span></div><p className="whitespace-pre-wrap text-sm leading-relaxed text-orbit-text-secondary">{incident.description}</p><p className="mt-3 text-xs text-orbit-muted">Observada: {new Date(incident.observed_at).toLocaleString("es-CO")}</p></div><div className="flex shrink-0 items-start gap-2"><button className="glass-button-secondary text-xs" onClick={() => void openEvidence(incident)}><DocumentIcon className="h-4 w-4" />{incident.evidence_count ?? 0} evidencias</button><button className="glass-button-secondary text-xs" onClick={async () => { await updateInformationIncident(incident.id, { status: incident.status === "active" ? "resolved" : "active" }); await loadTask(task.id); }}>{incident.status === "active" ? "Resolver" : "Reabrir"}</button></div></div></div>)}</div>}</section>
      <section className="mt-6"><h2 className="mb-3 font-display text-lg font-semibold">Historial</h2>{history.length === 0 ? <Empty text="No hay cambios registrados." /> : <div className="divide-y divide-orbit-border rounded-xl border border-orbit-border">{history.map((entry) => <div key={entry.id} className="flex flex-col justify-between gap-1 px-4 py-3 text-sm sm:flex-row"><span><strong className="capitalize">{auditActionLabel(entry.action)}</strong> por {entry.performed_by_email}</span><time className="text-xs text-orbit-muted">{new Date(entry.performed_at).toLocaleString("es-CO")}</time></div>)}</div>}</section>
    </>}
    {modal === "task" && task && <TaskForm initial={task} subtask={Boolean(task.parent_task_id)} inheritedOwner={task.inherited_owner_name} saving={saving} onClose={() => setModal(null)} onSave={async (data) => { setSaving(true); try { await updateInformationTask(task.id, data); setModal(null); await loadTask(task.id); } catch (reason) { setError(reason instanceof Error ? reason.message : "No fue posible guardar"); } finally { setSaving(false); } }} />}
    {modal === "subtask" && task && <TaskForm subtask inheritedOwner={task.zoho_owner_name || task.inherited_owner_name} saving={saving} onClose={() => setModal(null)} onSave={async (data) => { setSaving(true); try { await createInformationTask(task.project_id, { ...data, parent_task_id: task.id }); setModal(null); await loadTask(task.id); } finally { setSaving(false); } }} />}
    {modal === "incident" && task && <IncidentForm saving={saving} onClose={() => setModal(null)} onSave={async (data) => { setSaving(true); try { await createInformationIncident(task.id, data); setModal(null); await loadTask(task.id); } finally { setSaving(false); } }} />}
    {modal === "evidence" && selectedIncident && <EvidenceModal incident={selectedIncident} evidence={evidence} saving={saving} onClose={() => setModal(null)} onUpload={async (files, evidenceAt, description) => { setSaving(true); try { await uploadInformationEvidence(selectedIncident.id, files, evidenceAt, description); setEvidence(await getInformationEvidence(selectedIncident.id)); await loadTask(task!.id); } finally { setSaving(false); } }} onVoid={async (item) => { const reason = window.prompt("Motivo para anular la evidencia:"); if (!reason?.trim()) return; await voidInformationEvidence(item.id, reason.trim()); setEvidence(await getInformationEvidence(selectedIncident.id)); }} />}
  </>;
};

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: React.ReactNode }) { return <div className="relative mb-6 overflow-hidden rounded-3xl border border-violet-100 bg-gradient-to-br from-violet-50 via-white to-cyan-50 p-6 shadow-sm dark:border-violet-900/50 dark:from-[#21162e] dark:via-orbit-surface dark:to-[#10242a] sm:p-8"><div className="pointer-events-none absolute -right-16 -top-20 h-52 w-52 rounded-full bg-fuchsia-200/30 blur-3xl dark:bg-fuchsia-700/15" /><div className="pointer-events-none absolute -bottom-24 left-1/3 h-44 w-44 rounded-full bg-cyan-200/30 blur-3xl dark:bg-cyan-600/10" /><div className="relative flex flex-col justify-between gap-5 sm:flex-row sm:items-center"><div className="flex items-start gap-4"><span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-violet-600 shadow-sm ring-1 ring-violet-100 dark:bg-orbit-elevated dark:text-violet-300 dark:ring-violet-800 sm:flex"><FolderIcon className="h-6 w-6" /></span><div><p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-violet-500 dark:text-violet-300">Gestión de información</p><h1 className="font-display text-2xl font-semibold tracking-tight text-orbit-text sm:text-3xl">{title}</h1><p className="mt-1.5 max-w-2xl text-sm text-orbit-muted">{subtitle}</p></div></div>{action && <div className="shrink-0">{action}</div>}</div></div>; }
function Search({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) { return <div className="relative flex-1"><MagnifyingGlassIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-orbit-muted" /><input className="glass-input pl-9" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} /></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="group rounded-2xl border border-orbit-border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-violet-200 hover:shadow-md dark:bg-orbit-surface dark:hover:border-violet-700"><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-orbit-muted">{label}</span><strong className="mt-2 block truncate text-base text-orbit-text">{value}</strong><span className="mt-3 block h-1 w-8 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all group-hover:w-12" /></div>; }
function StatusPill<T extends string>({ value, labels }: { value: T; labels: Record<T, string> }) { const colors: Record<string, string> = { pending: "bg-amber-50 text-amber-700 ring-amber-200", in_progress: "bg-blue-50 text-blue-700 ring-blue-200", completed: "bg-emerald-50 text-emerald-700 ring-emerald-200", cancelled: "bg-slate-100 text-slate-600 ring-slate-200" }; return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${colors[value] ?? "bg-violet-50 text-violet-700 ring-violet-200"}`}>{labels[value]}</span>; }
function ReviewPill({ value }: { value: InformationTask["review_status"] }) { const colors = value === "correct" ? "bg-green-50 text-green-700" : value === "pending_correction" ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"; return <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${colors}`}>{REVIEW_STATUS[value]}</span>; }
function Pagination({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) { if (pages <= 1) return null; return <div className="mt-5 flex items-center justify-center gap-3"><button className="glass-button-secondary p-2" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeftIcon className="h-4 w-4" /></button><span className="text-sm text-orbit-muted">Página {page} de {pages}</span><button className="glass-button-secondary p-2" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRightIcon className="h-4 w-4" /></button></div>; }

function ProjectForm({ initial, areas, saving, onClose, onSave }: { initial?: InformationProject; areas: CatalogArea[]; saving: boolean; onClose: () => void; onSave: (data: Partial<InformationProject>) => Promise<void> }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", description: initial?.description ?? "", area_id: String(initial?.area_id ?? ""), zoho_project_id: initial?.zoho_project_id ?? "", zoho_owner_name: initial?.zoho_owner_name ?? "", status: initial?.status ?? "pending", start_date: initial?.start_date ?? "", end_date: initial?.end_date ?? "" });
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  return <ModalShell title={initial ? "Editar proyecto" : "Nuevo proyecto"} onClose={onClose}><form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void onSave({ ...form, area_id: Number(form.area_id), status: form.status as InformationProject["status"] }); }}><Field label="Nombre" wide><input required className="glass-input" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="Área"><select required className="glass-input" value={form.area_id} onChange={(e) => set("area_id", e.target.value)}><option value="">Selecciona...</option>{areas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></Field><Field label="Estado"><select className="glass-input" value={form.status} onChange={(e) => set("status", e.target.value)}>{Object.entries(PROJECT_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="ID de Zoho (opcional)"><input className="glass-input" value={form.zoho_project_id} onChange={(e) => set("zoho_project_id", e.target.value)} /></Field><Field label="Propietario en Zoho"><input className="glass-input" value={form.zoho_owner_name} onChange={(e) => set("zoho_owner_name", e.target.value)} /></Field><Field label="Fecha de inicio"><input type="date" className="glass-input" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field><Field label="Fecha final"><input type="date" className="glass-input" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} /></Field><Field label="Descripción" wide><textarea rows={4} className="glass-input" value={form.description} onChange={(e) => set("description", e.target.value)} /></Field><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="glass-button-secondary" onClick={onClose}>Cancelar</button><button disabled={saving} className="glass-button-primary">{saving ? "Guardando..." : "Guardar"}</button></div></form></ModalShell>;
}

function TaskForm({ initial, subtask, inheritedOwner, saving, onClose, onSave }: { initial?: InformationTask; subtask?: boolean; inheritedOwner?: string | null; saving: boolean; onClose: () => void; onSave: (data: Partial<InformationTask>) => Promise<void> }) {
  const [form, setForm] = useState({ name: initial?.name ?? "", description: initial?.description ?? "", zoho_task_id: initial?.zoho_task_id ?? "", zoho_owner_name: initial?.zoho_owner_name ?? inheritedOwner ?? "", zoho_status: initial?.zoho_status ?? "pending", review_status: initial?.review_status ?? "unreviewed", completion_percentage: String(initial?.completion_percentage ?? 0), priority: initial?.priority ?? "medium", start_date: initial?.start_date ?? "", due_date: initial?.due_date ?? "" });
  const set = (key: string, value: string) => setForm((old) => ({ ...old, [key]: value }));
  return <ModalShell title={initial ? "Editar tarea" : subtask ? "Nueva subtarea" : "Nueva tarea"} onClose={onClose}><form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => { event.preventDefault(); void onSave({ ...form, zoho_status: form.zoho_status as InformationTask["zoho_status"], review_status: form.review_status as InformationTask["review_status"], priority: form.priority as InformationTask["priority"], completion_percentage: Number(form.completion_percentage) }); }}><Field label="Nombre" wide><input required className="glass-input" value={form.name} onChange={(e) => set("name", e.target.value)} /></Field><Field label="ID de Zoho (opcional)"><input className="glass-input" value={form.zoho_task_id} onChange={(e) => set("zoho_task_id", e.target.value)} /></Field><Field label={subtask ? "Propietario heredado" : "Propietario en Zoho"}><input className={`glass-input ${subtask ? "bg-orbit-bg-secondary" : ""}`} readOnly={subtask} value={form.zoho_owner_name} onChange={(e) => set("zoho_owner_name", e.target.value)} /></Field><Field label="Estado en Zoho"><select className="glass-input" value={form.zoho_status} onChange={(e) => set("zoho_status", e.target.value)}>{Object.entries(PROJECT_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Revisión Orbit"><select className="glass-input" value={form.review_status} onChange={(e) => set("review_status", e.target.value)}>{Object.entries(REVIEW_STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Prioridad"><select className="glass-input" value={form.priority} onChange={(e) => set("priority", e.target.value)}>{Object.entries(PRIORITY).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Cumplimiento %"><input type="number" min="0" max="100" className="glass-input" value={form.completion_percentage} onChange={(e) => set("completion_percentage", e.target.value)} /></Field><Field label="Fecha de inicio"><input type="date" className="glass-input" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></Field><Field label="Fecha de vencimiento"><input type="date" className="glass-input" value={form.due_date} onChange={(e) => set("due_date", e.target.value)} /></Field><Field label="Descripción" wide><textarea rows={4} className="glass-input" value={form.description} onChange={(e) => set("description", e.target.value)} /></Field><div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="glass-button-secondary" onClick={onClose}>Cancelar</button><button disabled={saving} className="glass-button-primary">{saving ? "Guardando..." : "Guardar"}</button></div></form></ModalShell>;
}

function IncidentForm({ saving, onClose, onSave }: { saving: boolean; onClose: () => void; onSave: (data: { description: string; observed_at: string }) => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [observedAt, setObservedAt] = useState(nowLocalInput());

  return <ModalShell title="Nueva incidencia" onClose={onClose}>
    <form onSubmit={(event) => { event.preventDefault(); void onSave({ description, observed_at: new Date(observedAt).toISOString() }); }}>
      <div className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <p>Describe claramente el hallazgo y registra el momento exacto en que fue observado.</p>
      </div>

      <div className="grid gap-6">
        <Field label="Descripción de lo incorrecto">
          <textarea
            required
            rows={6}
            className="glass-input min-h-36 resize-y"
            placeholder="Ej. La información registrada no coincide con el soporte adjunto..."
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        <div className="rounded-xl border border-orbit-border bg-orbit-bg-secondary p-4">
          <Field label="Fecha y hora de observación">
            <input
              required
              type="datetime-local"
              className="glass-input bg-white sm:max-w-sm"
              value={observedAt}
              onChange={(event) => setObservedAt(event.target.value)}
            />
          </Field>
        </div>
      </div>

      <div className="-mx-5 -mb-5 mt-6 flex flex-col-reverse gap-2 border-t border-orbit-border bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end">
        <button type="button" className="glass-button-secondary" onClick={onClose}>Cancelar</button>
        <button disabled={saving} className="glass-button-primary">
          {saving ? "Registrando..." : "Registrar incidencia"}
        </button>
      </div>
    </form>
  </ModalShell>;
}

function EvidenceModal({ incident, evidence, saving, onClose, onUpload, onVoid }: { incident: InformationIncident; evidence: InformationEvidence[]; saving: boolean; onClose: () => void; onUpload: (files: File[], evidenceAt: string, description: string) => Promise<void>; onVoid: (item: InformationEvidence) => Promise<void> }) { const [files, setFiles] = useState<File[]>([]); const [evidenceAt, setEvidenceAt] = useState(nowLocalInput()); const [description, setDescription] = useState(""); const validSize = useMemo(() => files.every((file) => file.size <= 25 * 1024 * 1024), [files]); return <ModalShell title="Evidencias" onClose={onClose}><p className="mb-4 rounded-xl bg-orbit-bg-secondary p-3 text-sm">{incident.description}</p><form className="mb-6 space-y-3 rounded-xl border border-orbit-border p-4" onSubmit={(event) => { event.preventDefault(); if (validSize) void onUpload(files, new Date(evidenceAt).toISOString(), description).then(() => { setFiles([]); setDescription(""); }); }}><Field label="Archivos (máximo 10, 25 MB cada uno)"><input required multiple type="file" accept=".jpg,.jpeg,.png,.webp,.pdf,.csv,.txt,.doc,.docx,.xls,.xlsx" className="glass-input" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} /></Field>{!validSize && <p className="text-sm text-red-600">Uno de los archivos supera 25 MB.</p>}<Field label="Fecha y hora de la evidencia"><input required type="datetime-local" className="glass-input" value={evidenceAt} onChange={(e) => setEvidenceAt(e.target.value)} /></Field><Field label="Descripción opcional"><input className="glass-input" value={description} onChange={(e) => setDescription(e.target.value)} /></Field><button disabled={saving || files.length === 0 || !validSize} className="glass-button-primary"><ArrowUpTrayIcon className="h-4 w-4" />{saving ? "Cargando..." : "Adjuntar evidencia"}</button></form><div className="space-y-2">{evidence.length === 0 ? <Empty text="Todavía no hay evidencias." /> : evidence.map((item) => <div key={item.id} className={`flex items-center gap-2 rounded-xl border border-orbit-border p-3 ${item.voided_at ? "opacity-50" : ""}`}><button disabled={Boolean(item.voided_at)} className="flex min-w-0 flex-1 items-center justify-between text-left" onClick={() => void downloadInformationEvidence(item)}><div className="min-w-0"><strong className="block truncate text-sm">{item.original_filename}</strong><span className="text-xs text-orbit-muted">{item.voided_at ? `Anulada · ${item.void_reason}` : `${(item.file_size / 1024 / 1024).toFixed(2)} MB · ${new Date(item.evidence_at).toLocaleString("es-CO")}`}</span></div><DocumentIcon className="h-5 w-5 shrink-0 text-orbit-primary" /></button>{!item.voided_at && <button className="rounded-lg p-2 text-orbit-muted hover:bg-red-50 hover:text-red-600" title="Anular evidencia" onClick={() => void onVoid(item)}><XMarkIcon className="h-4 w-4" /></button>}</div>)}</div></ModalShell>; }
