import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PlusIcon, 
  RectangleGroupIcon, 
  MapPinIcon, 
  ClockIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  BriefcaseIcon,
  UserIcon,
  CalendarIcon,
  ExclamationCircleIcon,
  Bars2Icon
} from '@heroicons/react/24/solid';
import { 
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragStartEvent,
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Vacancy, View, Teacher, Coordinator } from '@/src/types';
import { getVacancies } from '@/src/lib/api';

function dedicationToPriority(dedication: string): Vacancy['priority'] {
  if (
    dedication === 'Tiempo Completo (44 Horas)' ||
    (dedication.includes('Tiempo Completo') && dedication.includes('44'))
  ) {
    return 'high';
  }
  if (
    dedication === 'Medio Tiempo (22 Horas)' ||
    (dedication.includes('Medio Tiempo') && dedication.includes('22'))
  ) {
    return 'medium';
  }
  return 'low';
}

function mapVacancyFromApi(row: Record<string, unknown>): Vacancy {
  const dedication = String(row.dedication ?? '');
  const line = row.academic_line != null ? String(row.academic_line) : '';
  const subj = row.subjects != null ? String(row.subjects) : '';
  const titleSource = line || subj;
  const title =
    titleSource.trim().length > 0
      ? titleSource.slice(0, 50)
      : 'Vacante';

  const rawStatus = String(row.status ?? 'open');
  const status: Vacancy['status'] =
    rawStatus === 'open' ||
    rawStatus === 'in-progress' ||
    rawStatus === 'filled' ||
    rawStatus === 'cancelled'
      ? rawStatus
      : 'open';

  let createdAt = '';
  if (row.created_at != null) {
    const s = String(row.created_at);
    const d = new Date(s);
    createdAt = Number.isNaN(d.getTime()) ? s.slice(0, 10) : d.toISOString().slice(0, 10);
  }

  return {
    id: String(row.id ?? ''),
    title,
    program: String(row.program ?? ''),
    campus: String(row.campus ?? ''),
    coordinator: String(row.coordinator_name ?? ''),
    status,
    createdAt,
    priority: dedicationToPriority(dedication),
  };
}

interface SortableVacancyCardProps {
  vacancy: Vacancy;
  onClick: () => void;
}

const SortableVacancyCard: React.FC<SortableVacancyCardProps> = ({ vacancy, onClick }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: vacancy.id });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <motion.div 
        layout
        onClick={onClick}
        className="glass-card p-4 hover:border-violet-200/50 cursor-grab active:cursor-grabbing group transition-all duration-300"
      >
        <div className="flex justify-between items-start mb-2">
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md",
            vacancy.priority === 'high' 
              ? "bg-red-50 text-red-600 border border-red-100" 
              : vacancy.priority === 'medium'
                ? "bg-amber-50 text-amber-600 border border-amber-100"
                : "bg-slate-50 text-slate-500 border border-slate-100"
          )}>
            {vacancy.priority}
          </span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-bold font-mono">#{vacancy.id}</span>
            <Bars2Icon className="h-3 w-3 text-slate-300 group-hover:text-violet-400 transition-colors" />
          </div>
        </div>
        <h4 className="font-bold text-slate-900 text-sm mb-3 leading-tight group-hover:text-violet-600 transition-colors">
          {vacancy.title}
        </h4>
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <RectangleGroupIcon className="h-3 w-3 text-violet-400" />
            <span>{vacancy.program}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <MapPinIcon className="h-3 w-3 text-cyan-400" />
            <span>{vacancy.campus}</span>
          </div>
        </div>
        <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-violet-100 to-fuchsia-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-violet-600 shadow-sm">
              {(vacancy.coordinator || ' ')
                .split(' ')
                .filter(Boolean)
                .map((n) => n[0])
                .join('') || '?'}
            </div>
            <span className="text-[10px] text-slate-400 font-medium">{vacancy.coordinator}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium">{vacancy.createdAt}</span>
        </div>
      </motion.div>
    </div>
  );
};

interface VacanciesViewProps {
  onSelectVacancy: (v: Vacancy) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const VacanciesView: React.FC<VacanciesViewProps> = ({ 
  onSelectVacancy,
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const listKeyRef = useRef<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const key = searchQuery;
        let pageToUse = currentPage;
        if (listKeyRef.current !== key) {
          if (listKeyRef.current !== null) {
            pageToUse = 1;
            if (currentPage !== 1) setCurrentPage(1);
          }
          listKeyRef.current = key;
        }

        const res = await getVacancies({
          page: pageToUse,
          limit: 50,
        });
        if (!cancelled) {
          const list = Array.isArray(res.data)
            ? res.data.map((r) =>
                mapVacancyFromApi(r as Record<string, unknown>)
              )
            : [];
          setVacancies(list);
          setTotalCount(res.pagination?.total ?? 0);
          setTotalPages(res.pagination?.totalPages ?? 0);
        }
      } catch {
        if (!cancelled) {
          setVacancies([]);
          setTotalCount(0);
          setTotalPages(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentPage, searchQuery]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const filteredVacancies = useMemo(() => {
    return vacancies.filter(v => 
      v.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
      v.program.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, vacancies]);

  const columns = [
    { id: 'open', label: 'Abiertas', color: 'bg-blue-500' },
    { id: 'in-progress', label: 'En Proceso', color: 'bg-amber-500' },
    { id: 'filled', label: 'Cubiertas', color: 'bg-emerald-500' },
    { id: 'cancelled', label: 'Canceladas', color: 'bg-red-500' },
  ];

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;

    // Check if dropped over a column or another card
    const overColumn = columns.find(col => col.id === overId);
    
    if (overColumn) {
      setVacancies(prev => prev.map(v => 
        v.id === activeId ? { ...v, status: overColumn.id as any } : v
      ));
    } else {
      // Dropped over another card
      const overVacancy = vacancies.find(v => v.id === overId);
      if (overVacancy && overVacancy.status !== vacancies.find(v => v.id === activeId)?.status) {
        setVacancies(prev => prev.map(v => 
          v.id === activeId ? { ...v, status: overVacancy.status } : v
        ));
      }
    }

    setActiveId(null);
  };

  const handleAddVacancy = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newVacancy: Vacancy = {
      id: `V${vacancies.length + 1}`,
      title: formData.get('title') as string,
      program: formData.get('program') as string,
      campus: formData.get('campus') as string,
      coordinator: formData.get('coordinator') as string,
      status: formData.get('status') as any || 'open',
      priority: formData.get('priority') as any || 'medium',
      createdAt: new Date().toISOString().split('T')[0],
    };
    setVacancies(prev => [newVacancy, ...prev]);
    setShowForm(false);
  };

  const activeVacancy = activeId ? vacancies.find(v => v.id === activeId) : null;

  return (
    <div className="space-y-8 relative">
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header 
        title="Gestión de Vacantes" 
        subtitle="Pipeline de contratación y flujo operativo" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
        <div className="flex flex-col md:flex-row gap-4 flex-1 lg:max-w-2xl">
          <div className="glass-panel p-2 flex-1 flex items-center gap-3">
            <MagnifyingGlassIcon className="ml-3 h-4.5 w-4.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar vacantes por título o programa..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
              className="w-full bg-transparent border-none focus:ring-0 text-sm py-2"
            />
          </div>
          <button 
            onClick={() => setShowForm(true)}
            className="glass-button-primary flex items-center gap-2 px-8 py-3 whitespace-nowrap"
          >
            <PlusIcon className="h-5 w-5" />
            <span>Nueva Vacante</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 relative z-10">
          <div className="h-10 w-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-600">Cargando...</p>
        </div>
      ) : filteredVacancies.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4"
        >
          <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-white/50 shadow-inner">
            <MagnifyingGlassIcon className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 font-display">No se encontraron vacantes</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              No pudimos encontrar vacantes que coincidan con tu búsqueda actual.
            </p>
          </div>
          <button 
            onClick={() => setSearchQuery?.('')}
            className="text-violet-600 font-bold text-xs uppercase tracking-widest hover:underline pt-4"
          >
            Ver todas las vacantes
          </button>
        </motion.div>
      ) : (
        <DndContext 
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
            {columns.map((column) => (
              <div key={column.id} className="space-y-4 flex flex-col h-full">
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2">
                    <div className={cn("w-2 h-2 rounded-full", column.color)}></div>
                    <h3 className="font-bold text-slate-700 font-display">{column.label}</h3>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 bg-white/50 backdrop-blur-sm border border-white/20 px-2 py-0.5 rounded-full shadow-sm">
                    {filteredVacancies.filter(v => v.status === column.id).length}
                  </span>
                </div>
                
                <div 
                  id={column.id}
                  className="space-y-4 flex-1 min-h-[500px] p-2 rounded-2xl bg-slate-50/30 border border-dashed border-slate-200/50 transition-colors"
                >
                  <SortableContext 
                    items={filteredVacancies.filter(v => v.status === column.id).map(v => v.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {filteredVacancies.filter(v => v.status === column.id).map((vacancy) => (
                      <SortableVacancyCard 
                        key={vacancy.id} 
                        vacancy={vacancy} 
                        onClick={() => onSelectVacancy(vacancy)} 
                      />
                    ))}
                  </SortableContext>
                  
                  <button 
                    onClick={() => setShowForm(true)}
                    className="w-full py-4 border-2 border-dashed border-slate-200/50 rounded-2xl text-slate-400 hover:text-violet-600 hover:border-violet-300/50 hover:bg-white/40 transition-all flex items-center justify-center gap-2 text-sm font-bold backdrop-blur-sm"
                  >
                    <PlusIcon className="h-4 w-4" />
                    <span>Añadir</span>
                  </button>
                </div>
              </div>
            ))}
          </div>

          <DragOverlay dropAnimation={{
            sideEffects: defaultDropAnimationSideEffects({
              styles: {
                active: {
                  opacity: '0.5',
                },
              },
            }),
          }}>
            {activeVacancy ? (
              <div className="glass-card p-4 shadow-2xl border-violet-400/50 rotate-3 scale-105 pointer-events-none">
                <h4 className="font-bold text-slate-900 text-sm mb-2">{activeVacancy.title}</h4>
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  <RectangleGroupIcon className="h-3 w-3 text-violet-400" />
                  <span>{activeVacancy.program}</span>
                </div>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {!loading && totalCount > 0 && (
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 py-8 relative z-10">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
          >
            Anterior
          </button>
          <p className="text-sm font-medium text-slate-600">
            Página {currentPage} de {Math.max(totalPages, 1)} ({totalCount}{" "}
            vacantes)
          </p>
          <button
            type="button"
            disabled={currentPage >= totalPages || totalPages < 1}
            onClick={() => setCurrentPage((p) => p + 1)}
            className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
          >
            Siguiente
          </button>
        </div>
      )}

      {/* New Vacancy Form Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl glass-panel p-6 sm:p-8 relative z-10 shadow-2xl overflow-y-auto max-h-[90vh] no-scrollbar"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-600 via-fuchsia-500 to-cyan-500"></div>
              
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
                    <PlusIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 font-display">Nueva Vacante</h2>
                    <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Registro de requerimiento docente</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowForm(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddVacancy} className="space-y-6">
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Título de la Vacante</label>
                  <div className="relative">
                    <BriefcaseIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input 
                      name="title"
                      type="text" 
                      required
                      className="glass-input pl-12 py-3 text-sm" 
                      placeholder="Ej: Docente Tiempo Completo - IA"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Programa</label>
                    <div className="relative">
                      <RectangleGroupIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="program"
                        type="text" 
                        required
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="Ej: Ingeniería"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Sede</label>
                    <div className="relative">
                      <MapPinIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <select name="campus" className="glass-input pl-12 py-3 text-sm appearance-none">
                        <option value="Sede Norte">Sede Norte</option>
                        <option value="Sede Centro">Sede Centro</option>
                        <option value="Sede Sur">Sede Sur</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Coordinador Responsable</label>
                    <div className="relative">
                      <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input 
                        name="coordinator"
                        type="text" 
                        required
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="Nombre del coordinador"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Prioridad</label>
                    <select name="priority" className="glass-input py-3 text-sm appearance-none">
                      <option value="low">Baja</option>
                      <option value="medium">Media</option>
                      <option value="high">Alta</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 glass-button-secondary py-4 text-xs font-bold uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] glass-button-primary py-4 text-xs font-bold uppercase tracking-widest"
                  >
                    Crear Vacante
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
