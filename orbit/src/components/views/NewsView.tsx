import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  InformationCircleIcon,
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

  return (
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header
        title="Novedades y Reportes"
        subtitle="Seguimiento de novedades por escuela o área"
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        <div className="lg:col-span-8 space-y-6">
          <div className="glass-panel p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
              <h3 className="text-lg font-bold text-slate-900 font-display">
                Feed de Novedades
              </h3>
              <div
                data-tutorial="news-filters"
                className="flex flex-wrap items-center gap-2 w-full sm:w-auto"
              >
                <div className="glass-panel p-1 flex items-center gap-2 flex-1 min-w-[140px] sm:flex-none">
                  <MagnifyingGlassIcon className="ml-2 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar…"
                    value={feedSearch}
                    onChange={(e) => setFeedSearch(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-xs py-1 w-full sm:w-40"
                  />
                </div>
                <select
                  className="glass-input py-1.5 text-xs max-w-[130px]"
                  value={statusFilter}
                  onChange={(e) =>
                    setStatusFilter(e.target.value as WorkforceEventStatus | '')
                  }
                >
                  <option value="">Estado</option>
                  {WORKFORCE_EVENT_STATUS_OPTIONS.map((st) => (
                    <option key={st} value={st}>
                      {WORKFORCE_EVENT_STATUS_LABELS[st]}
                    </option>
                  ))}
                </select>
                <select
                  className="glass-input py-1.5 text-xs max-w-[120px]"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                >
                  <option value="">Tipo</option>
                  {eventTypes.map((t) => (
                    <option key={t.id} value={String(t.id)}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {areas.length > 0 ? (
                  <select
                    className="glass-input py-1.5 text-xs max-w-[120px]"
                    value={areaFilter}
                    disabled={Boolean(lockedAreaId)}
                    onChange={(e) => {
                      setAreaFilter(e.target.value);
                      setSchoolFilter('');
                    }}
                  >
                    {!lockedAreaId ? <option value="">Área</option> : null}
                    {areas.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                {schools.length > 0 ? (
                  <select
                    className="glass-input py-1.5 text-xs max-w-[140px]"
                    value={schoolFilter}
                    onChange={(e) => setSchoolFilter(e.target.value)}
                  >
                    <option value="">Escuela</option>
                    {schools.map((s) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  className="glass-button-secondary p-2 shrink-0"
                  title="Aplicar filtros"
                  onClick={() => void loadEvents()}
                >
                  <FunnelIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            {error ? (
              <p className="mb-4 text-sm text-red-600">{error}</p>
            ) : null}

            <div className="space-y-6">
              {loading ? (
                <p className="py-12 text-center text-sm text-slate-500">
                  Cargando novedades…
                </p>
              ) : events.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-white/50 shadow-inner">
                    <MagnifyingGlassIcon className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-900 font-display">
                      No hay novedades
                    </h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
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
                    className="relative pl-6 border-l-2 border-slate-200/50 hover:border-violet-400 transition-colors group"
                  >
                    <div
                      className={cn(
                        'absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm',
                        news.status === 'NOT_TAKEN' || news.status === 'PENDING'
                          ? 'bg-amber-500'
                          : news.status === 'TAKEN' || news.status === 'APPROVED'
                            ? 'bg-emerald-500'
                            : 'bg-blue-500'
                      )}
                    />

                    <div className="flex justify-between items-start mb-2 gap-4">
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 group-hover:text-violet-600 transition-colors truncate">
                          {news.person.name}
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">
                            {formatEventDate(news.created_at)}
                          </span>
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border bg-violet-50 text-violet-600 border-violet-100">
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
                          <p className="text-[10px] text-slate-400 mt-0.5">
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
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                      {news.observation ?? '—'}
                    </p>
                    {formatWorkforceEventSchedule(news) ? (
                      <p className="text-xs text-slate-400 mt-1">
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
          <div className="glass-panel p-6 bg-white border-white/50 shadow-xl overflow-hidden relative">
            <div className="relative z-10">
              <h3 className="font-bold mb-4 font-display text-lg text-slate-900">
                Registrar Novedad
              </h3>
              <p className="text-xs text-slate-500 mb-6 font-medium">
                Busque la persona y complete el reporte.
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">
                    Persona
                  </label>
                  <PersonSearchCombobox
                    value={selectedPerson}
                    onChange={setSelectedPerson}
                    placeholder="Escriba nombre o documento…"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">
                    Tipo
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm"
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
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">
                    Estado
                  </label>
                  <select
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm"
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
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">
                    Descripción
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 h-24 resize-none"
                    placeholder="Detalles de la novedad…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Fecha inicio
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => setFormStartDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Fecha fin
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Hora inicio
                    </label>
                    <input
                      type="time"
                      value={formStartTime}
                      onChange={(e) => setFormStartTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                      Hora fin
                    </label>
                    <input
                      type="time"
                      value={formEndTime}
                      onChange={(e) => setFormEndTime(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                {formMessage ? (
                  <p className="text-xs text-violet-600 font-medium">{formMessage}</p>
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
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 font-display">
              <InformationCircleIcon className="h-4.5 w-4.5 text-violet-500" />
              Resumen
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-100/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Pendientes / no tomados
                </span>
                <span className="text-lg font-bold text-amber-600">{criticalCount}</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Total en lista
                </span>
                <span className="text-lg font-bold text-slate-900">{events.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
