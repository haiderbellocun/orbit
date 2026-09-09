import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  InformationCircleIcon,
  ChevronDownIcon,
  XMarkIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, Vacancy, Coordinator } from '@/src/types';
import { PersonSearchCombobox } from '@/src/components/common/PersonSearchCombobox';
import { WorkforceEventStatusHistory } from '@/src/components/common/WorkforceEventStatusHistory';
import {
  createWorkforceEvent,
  getCatalogAreas,
  getCatalogSchools,
  getStoredPlantaActivaAccess,
  getWorkforceEventTypes,
  getWorkforceEvents,
  patchWorkforceEventStatus,
  type WorkforceEvent,
  type WorkforceEventStatus,
  type WorkforceEventType,
} from '@/src/lib/api';
import type { PersonPick } from '@/src/components/common/PersonSearchCombobox';
import {
  WORKFORCE_EVENT_STATUS_LABELS,
  WORKFORCE_EVENT_STATUS_OPTIONS,
  formatWorkforceEventSchedule,
  workforceStatusBadgeClass,
} from '@/src/lib/workforceEventLabels';

interface NewsViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

function formatEventDate(iso: string) {
  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

const selectClass =
  'w-full min-w-0 max-w-full rounded-xl border border-orbit-border/80 bg-orbit-bg-secondary px-3 py-2.5 text-sm text-orbit-text shadow-sm focus:outline-none focus:ring-2 focus:ring-orbit-primary/30';

export const NewsView: React.FC<NewsViewProps> = ({
  searchQuery = '',
  setSearchQuery,
  searchResults,
}) => {
  const plantaAccess = useMemo(() => getStoredPlantaActivaAccess(), []);
  const lockedViewAreaIds = plantaAccess?.viewAreaIds ?? null;
  const lockedAreaId =
    lockedViewAreaIds != null && lockedViewAreaIds.length === 1
      ? String(lockedViewAreaIds[0])
      : '';

  const [feedSearch, setFeedSearch] = useState('');
  const [appliedFeedSearch, setAppliedFeedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<WorkforceEventStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [schoolFilter, setSchoolFilter] = useState<string>('');
  const [areaFilter, setAreaFilter] = useState<string>(lockedAreaId);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [events, setEvents] = useState<WorkforceEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventTypes, setEventTypes] = useState<WorkforceEventType[]>([]);
  const [schools, setSchools] = useState<Array<{ id: number; name: string }>>([]);
  const [areas, setAreas] = useState<Array<{ id: number; name: string }>>([]);

  const [selectedPerson, setSelectedPerson] = useState<PersonPick | null>(null);
  const [formTypeId, setFormTypeId] = useState('');
  const [formStatus, setFormStatus] = useState<WorkforceEventStatus>('NOT_TAKEN');
  const [formDescription, setFormDescription] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [formMessage, setFormMessage] = useState<string | null>(null);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getWorkforceEvents({
        limit: 100,
        search: appliedFeedSearch.trim() || undefined,
        status: statusFilter || undefined,
        event_type_id: typeFilter ? Number.parseInt(typeFilter, 10) : undefined,
        school_id: schoolFilter ? Number.parseInt(schoolFilter, 10) : undefined,
        area_id: areaFilter ? Number.parseInt(areaFilter, 10) : undefined,
      });
      setEvents(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar novedades');
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [appliedFeedSearch, statusFilter, typeFilter, schoolFilter, areaFilter]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  useEffect(() => {
    if (feedSearch === appliedFeedSearch) return;
    const t = window.setTimeout(() => {
      setAppliedFeedSearch(feedSearch);
    }, 300);
    return () => window.clearTimeout(t);
  }, [feedSearch, appliedFeedSearch]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [types, areasRes, schoolsRes] = await Promise.all([
          getWorkforceEventTypes(),
          getCatalogAreas(),
          getCatalogSchools(
            areaFilter ? { area_id: Number.parseInt(areaFilter, 10) } : undefined
          ),
        ]);
        if (!cancelled) {
          setEventTypes(types);
          const mappedAreas = areasRes.map((a) => ({ id: a.id, name: a.name }));
          setAreas(
            lockedViewAreaIds == null
              ? mappedAreas
              : mappedAreas.filter((a) => lockedViewAreaIds.includes(a.id))
          );
          setSchools(schoolsRes.map((s) => ({ id: s.id, name: s.name })));
          if (types.length > 0 && !formTypeId) {
            setFormTypeId(String(types[0].id));
          }
        }
      } catch {
        if (!cancelled) {
          setEventTypes([]);
          setAreas([]);
          setSchools([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [areaFilter, lockedViewAreaIds]);

  const criticalCount = useMemo(
    () => events.filter((e) => e.status === 'NOT_TAKEN' || e.status === 'PENDING').length,
    [events]
  );

  const handleSaveReport = async () => {
    const hasSchedule =
      formStartDate.trim() !== '' ||
      formEndDate.trim() !== '' ||
      formStartTime.trim() !== '' ||
      formEndTime.trim() !== '';

    if (!selectedPerson) {
      setFormMessage('Seleccione una persona de la lista.');
      return;
    }
    if (!formDescription.trim() && !hasSchedule) {
      setFormMessage('Describa la novedad o indique al menos una fecha u hora.');
      return;
    }
    const typeId = Number.parseInt(formTypeId, 10);
    if (!Number.isFinite(typeId)) {
      setFormMessage('Seleccione un tipo de novedad.');
      return;
    }
    setSaving(true);
    setFormMessage(null);
    try {
      await createWorkforceEvent({
        event_type_id: typeId,
        person_id: selectedPerson.id,
        observation: formDescription.trim() || null,
        start_date: formStartDate.trim() || null,
        end_date: formEndDate.trim() || null,
        start_time: formStartTime.trim() || null,
        end_time: formEndTime.trim() || null,
        status: formStatus,
      });
      setFormDescription('');
      setFormStatus('NOT_TAKEN');
      setFormStartDate('');
      setFormEndDate('');
      setFormStartTime('');
      setFormEndTime('');
      setSelectedPerson(null);
      setFormMessage('Novedad registrada.');
      await loadEvents();
    } catch (e) {
      setFormMessage(e instanceof Error ? e.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (id: string, status: WorkforceEventStatus) => {
    try {
      const updated = await patchWorkforceEventStatus(id, status);
      setEvents((prev) => prev.map((e) => (e.id === id ? updated : e)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar');
    }
  };

  const activeFilterCount = [
    statusFilter,
    typeFilter,
    schoolFilter,
    !lockedAreaId && areaFilter ? areaFilter : '',
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFeedSearch('');
    setAppliedFeedSearch('');
    setStatusFilter('');
    setTypeFilter('');
    setSchoolFilter('');
    setAreaFilter(lockedAreaId);
  };

  return (
    <div className="space-y-5 relative">
      <Header
        title="Novedades y Reportes"
        subtitle="Seguimiento de novedades por escuela o área"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 relative z-10">
        <div className="lg:col-span-8 space-y-4">
          <div className="glass-panel p-5">
            <h3 className="text-lg font-bold text-orbit-text font-display mb-4">
              Feed de Novedades
            </h3>

            <div data-tutorial="news-filters" className="space-y-3 mb-5">
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
                  <input
                    type="search"
                    placeholder="Buscar por persona o descripción…"
                    value={feedSearch}
                    onChange={(e) => setFeedSearch(e.target.value)}
                    className={cn(selectClass, 'pl-10')}
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setFiltersOpen((o) => !o)}
                    className={cn(
                      'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors',
                      filtersOpen || activeFilterCount > 0
                        ? 'bg-orbit-primary/10 border-orbit-primary/30 text-orbit-primary'
                        : 'bg-orbit-bg-secondary border-orbit-border/80 text-orbit-text-secondary hover:bg-orbit-bg-secondary'
                    )}
                    aria-expanded={filtersOpen}
                  >
                    <FunnelIcon className="h-4 w-4" />
                    Filtros
                    {activeFilterCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-md bg-orbit-primary text-white text-[10px] flex items-center justify-center">
                        {activeFilterCount}
                      </span>
                    )}
                    <ChevronDownIcon
                      className={cn(
                        'h-4 w-4 transition-transform',
                        filtersOpen && 'rotate-180'
                      )}
                    />
                  </button>
                  {(activeFilterCount > 0 || appliedFeedSearch.trim()) && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium text-orbit-muted hover:text-orbit-danger hover:bg-orbit-danger/10 transition-colors"
                      title="Limpiar filtros"
                    >
                      <XMarkIcon className="h-4 w-4" />
                      Limpiar
                    </button>
                  )}
                </div>
              </div>

              {filtersOpen && (
                <div className="pt-3 border-t border-orbit-border">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Estado
                      </span>
                      <select
                        className={selectClass}
                        value={statusFilter}
                        onChange={(e) =>
                          setStatusFilter(
                            e.target.value as WorkforceEventStatus | ''
                          )
                        }
                      >
                        <option value="">Todos</option>
                        {WORKFORCE_EVENT_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {WORKFORCE_EVENT_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                        Tipo
                      </span>
                      <select
                        className={selectClass}
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                      >
                        <option value="">Todos</option>
                        {eventTypes.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    {areas.length > 0 ? (
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                          Área
                        </span>
                        <select
                          className={selectClass}
                          value={areaFilter}
                          disabled={Boolean(lockedAreaId)}
                          onChange={(e) => {
                            setAreaFilter(e.target.value);
                            setSchoolFilter('');
                          }}
                        >
                          {!lockedAreaId ? <option value="">Todas</option> : null}
                          {areas.map((a) => (
                            <option key={a.id} value={String(a.id)}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {schools.length > 0 ? (
                      <label className="space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-orbit-muted">
                          Escuela
                        </span>
                        <select
                          className={selectClass}
                          value={schoolFilter}
                          onChange={(e) => setSchoolFilter(e.target.value)}
                        >
                          <option value="">Todas</option>
                          {schools.map((s) => (
                            <option key={s.id} value={String(s.id)}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                </div>
              )}
            </div>

            {error ? (
              <p className="mb-4 text-sm text-orbit-danger">{error}</p>
            ) : null}

            <div className="space-y-6">
              {loading ? (
                <p className="py-12 text-center text-sm text-orbit-muted">
                  Cargando novedades…
                </p>
              ) : events.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-orbit-bg-secondary flex items-center justify-center text-orbit-muted border border-orbit-border shadow-inner">
                    <MagnifyingGlassIcon className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-orbit-text font-display">
                      No hay novedades
                    </h3>
                    <p className="text-xs text-orbit-muted max-w-xs mx-auto">
                      Registre una novedad o ajuste los filtros de búsqueda.
                    </p>
                  </div>
                </div>
              ) : (
                events.map((news) => (
                  <motion.div
                    key={news.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative pl-6 border-l-2 border-orbit-border/50 hover:border-orbit-primary/50 transition-colors group"
                  >
                    <div
                      className={cn(
                        'absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white dark:border-orbit-surface shadow-sm',
                        news.status === 'NOT_TAKEN' || news.status === 'PENDING'
                          ? 'bg-orbit-warning/100'
                          : news.status === 'TAKEN' || news.status === 'APPROVED'
                            ? 'bg-orbit-success/100'
                            : 'bg-orbit-info/100'
                      )}
                    />

                    <div className="flex justify-between items-start mb-2 gap-4">
                      <div className="min-w-0">
                        <h4 className="font-bold text-orbit-text group-hover:text-orbit-primary transition-colors truncate">
                          {news.person.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-orbit-muted uppercase tracking-widest font-mono">
                            {formatEventDate(news.created_at)}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border bg-orbit-primary/10 text-orbit-primary border-orbit-primary/25">
                            {news.event_type_name}
                          </span>
                          <span
                            className={cn(
                              'text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border',
                              workforceStatusBadgeClass(news.status)
                            )}
                          >
                            {WORKFORCE_EVENT_STATUS_LABELS[news.status]}
                          </span>
                        </div>
                        {news.person.school_name ? (
                          <p className="text-[10px] text-orbit-muted mt-0.5">
                            {news.person.school_name}
                          </p>
                        ) : null}
                      </div>
                      <select
                        className="glass-input shrink-0 py-1 text-xs max-w-[130px]"
                        value={news.status}
                        onChange={(e) =>
                          void handleStatusChange(
                            news.id,
                            e.target.value as WorkforceEventStatus
                          )
                        }
                      >
                        {WORKFORCE_EVENT_STATUS_OPTIONS.map((st) => (
                          <option key={st} value={st}>
                            {WORKFORCE_EVENT_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <p className="text-sm text-orbit-text-secondary leading-relaxed font-medium">
                      {news.observation ?? '—'}
                    </p>
                    {formatWorkforceEventSchedule(news) ? (
                      <p className="text-xs text-orbit-muted mt-1">
                        {formatWorkforceEventSchedule(news)}
                      </p>
                    ) : null}
                    <WorkforceEventStatusHistory eventId={news.id} />
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-6 bg-orbit-elevated border-orbit-border shadow-xl overflow-hidden relative">
            <div className="relative z-10">
              <h3 className="font-bold mb-4 font-display text-lg text-orbit-text">
                Registrar Novedad
              </h3>
              <p className="text-xs text-orbit-muted mb-6 font-medium">
                Busque la persona y complete el reporte.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1 ml-1">
                    Persona
                  </label>
                  <PersonSearchCombobox
                    value={selectedPerson}
                    onChange={setSelectedPerson}
                    placeholder="Escriba nombre o documento…"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1 ml-1">
                    Tipo
                  </label>
                  <select
                    className="w-full bg-orbit-bg-secondary border border-orbit-border rounded-xl px-3 py-2 text-sm"
                    value={formTypeId}
                    onChange={(e) => setFormTypeId(e.target.value)}
                  >
                    {eventTypes.map((t) => (
                      <option key={t.id} value={String(t.id)}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1 ml-1">
                    Estado
                  </label>
                  <select
                    className="w-full bg-orbit-bg-secondary border border-orbit-border rounded-xl px-3 py-2 text-sm"
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as WorkforceEventStatus)
                    }
                  >
                    {WORKFORCE_EVENT_STATUS_OPTIONS.map((st) => (
                      <option key={st} value={st}>
                        {WORKFORCE_EVENT_STATUS_LABELS[st]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1 ml-1">
                    Descripción
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-orbit-bg-secondary border border-orbit-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-orbit-primary/50 h-24 resize-none"
                    placeholder="Detalles de la novedad…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1">
                      Fecha inicio
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full bg-orbit-bg-secondary border border-orbit-border rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1">
                      Fecha fin
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full bg-orbit-bg-secondary border border-orbit-border rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1">
                      Hora inicio
                    </label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full bg-orbit-bg-secondary border border-orbit-border rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest mb-1">
                      Hora fin
                    </label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full bg-orbit-bg-secondary border border-orbit-border rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {formMessage ? (
                  <p className="text-xs text-orbit-primary font-medium">{formMessage}</p>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSaveReport()}
                  className="glass-button-primary w-full py-3 text-sm font-bold tracking-widest uppercase disabled:opacity-50"
                >
                  {saving ? 'Guardando…' : 'Guardar reporte'}
                </button>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="font-bold text-orbit-text mb-4 flex items-center gap-2 font-display">
              <InformationCircleIcon className="h-4.5 w-4.5 text-orbit-primary" />
              Resumen
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-orbit-warning/10/50 border border-orbit-warning/30/50">
                <span className="text-xs font-bold text-orbit-muted uppercase tracking-wider">
                  Pendientes / no tomados
                </span>
                <span className="text-lg font-bold text-orbit-warning">{criticalCount}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-orbit-bg-secondary/50 border border-orbit-border/50">
                <span className="text-xs font-bold text-orbit-muted uppercase tracking-wider">
                  Total en lista
                </span>
                <span className="text-lg font-bold text-orbit-text">{events.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
