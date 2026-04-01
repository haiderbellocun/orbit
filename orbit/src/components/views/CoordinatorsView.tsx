import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UserCircleIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  RectangleGroupIcon, 
  PlusIcon, 
  MagnifyingGlassIcon, 
  FunnelIcon,
  ChevronRightIcon,
  XMarkIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Coordinator, View, Teacher, Vacancy } from '@/src/types';
import { getCoordinators } from '@/src/lib/api';

function mapCoordinatorFromApi(row: Record<string, unknown>): Coordinator {
  const st = String(row.status ?? 'active');
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    email: String(row.email ?? ''),
    phone: '',
    campus: String(row.campus ?? ''),
    assignments: Number(row.teachers_count ?? 0),
    status: st === 'inactive' ? 'inactive' : 'active',
  };
}

interface CoordinatorsViewProps {
  setView?: (v: View) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const CoordinatorsView: React.FC<CoordinatorsViewProps> = ({ 
  setView,
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoordinator, setSelectedCoordinator] = useState<Coordinator | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await getCoordinators();
        if (!cancelled) {
          const list = Array.isArray(rows)
            ? rows.map((r) => mapCoordinatorFromApi(r as Record<string, unknown>))
            : [];
          setCoordinators(list);
        }
      } catch {
        if (!cancelled) setCoordinators([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredCoordinators = useMemo(() => {
    return coordinators.filter((c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.campus.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, coordinators]);

  return (
    <div className="space-y-8 relative">
      {/* Decorative background elements */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header 
        title="Directorio de Coordinadores" 
        subtitle="Gestión de responsables por programa y sede" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div className="glass-panel p-4 flex flex-col md:flex-row gap-4 items-center flex-1">
          <div className="relative flex-1 w-full">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-slate-400" />
            <input 
              type="text" 
              placeholder="Buscar coordinador..." 
              className="glass-input w-full pl-10 pr-4 py-3 text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery?.(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <button className="glass-button-secondary flex-1 md:flex-none flex items-center justify-center gap-2 px-4 py-3 text-sm">
              <FunnelIcon className="h-4.5 w-4.5" />
              <span>Filtros</span>
            </button>
          </div>
        </div>
        <button className="glass-button-primary flex items-center gap-2 px-5 py-3 h-fit">
          <PlusIcon className="h-5 w-5" />
          <span>Nuevo Coordinador</span>
        </button>
      </div>

      {loading ? (
        <div className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4 relative z-10">
          <div className="h-10 w-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
          <p className="text-sm font-medium text-slate-600">Cargando...</p>
        </div>
      ) : filteredCoordinators.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 relative z-10">
          {filteredCoordinators.map((c, i) => (
            <motion.div 
              key={c.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={cn(
                "glass-card p-6 flex flex-col items-center text-center group transition-all duration-300 border-t-4",
                i % 2 === 0 ? "border-t-violet-500/50" : "border-t-cyan-500/50"
              )}
            >
              <div className="relative mb-4">
                <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center text-slate-300 group-hover:from-violet-50 group-hover:to-fuchsia-50 group-hover:text-violet-500 transition-all shadow-inner">
                  <UserCircleIcon className="h-12 w-12" />
                </div>
                <div className={cn(
                  "absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-4 border-white shadow-sm",
                  c.status === 'active' ? "bg-emerald-500" : "bg-slate-300"
                )}></div>
              </div>
              
              <h3 className="text-lg font-bold text-slate-900 font-display group-hover:text-violet-600 transition-colors">{c.name}</h3>
              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-[0.2em] mt-1">{c.campus}</p>
              
              <div className="mt-6 w-full space-y-3">
                <div className="flex items-center gap-3 text-xs text-slate-500 bg-white/40 p-2 rounded-lg border border-white/20">
                  <EnvelopeIcon className="h-3.5 w-3.5 shrink-0 text-violet-400" />
                  <span className="truncate">{c.email}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 bg-white/40 p-2 rounded-lg border border-white/20">
                  <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-cyan-400" />
                  <span>{c.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-500 bg-white/40 p-2 rounded-lg border border-white/20">
                  <RectangleGroupIcon className="h-3.5 w-3.5 shrink-0 text-fuchsia-400" />
                  <span>{c.assignments} Docentes</span>
                </div>
              </div>

              <button 
                onClick={() => setSelectedCoordinator(c)}
                className="w-full mt-8 py-3 glass-button-secondary text-xs flex items-center justify-center gap-2 group/btn"
              >
                <span>Ver Asignaciones</span>
                <ChevronRightIcon className="h-3.5 w-3.5 group-hover/btn:translate-x-1 transition-transform" />
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
          <h3 className="text-xl font-bold text-slate-900 mb-2 font-display">No se encontraron coordinadores</h3>
          <p className="text-slate-500 max-w-md">Intenta ajustar los criterios de búsqueda para encontrar lo que necesitas.</p>
          <button 
            onClick={() => setSearchQuery?.('')}
            className="text-violet-600 font-bold text-xs uppercase tracking-widest hover:underline pt-4"
          >
            Limpiar búsqueda
          </button>
        </motion.div>
      )}

      <div className="glass-panel p-6 relative z-10">
        <h3 className="text-lg font-bold text-slate-900 mb-6 font-display">Carga Operativa por Coordinador</h3>
        <div className="space-y-6">
          {coordinators.map((c) => (
            <div key={c.id} className="flex items-center gap-4">
              <span className="text-sm font-bold text-slate-700 w-32 shrink-0">{c.name}</span>
              <div className="flex-1 h-2 bg-slate-100/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/20">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${(c.assignments / 50) * 100}%` }}
                  className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 rounded-full shadow-[0_0_10px_rgba(139,92,246,0.3)]"
                ></motion.div>
              </div>
              <span className="text-xs font-bold text-slate-400 w-12 text-right font-mono">{c.assignments}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Assignments Modal */}
      <AnimatePresence>
        {selectedCoordinator && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedCoordinator(null)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-2xl glass-panel p-8 relative z-10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500"></div>
              
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600">
                    <RectangleGroupIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900 font-display">Asignaciones de {selectedCoordinator.name}</h2>
                    <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">{selectedCoordinator.campus} • {selectedCoordinator.assignments} Docentes</p>
                  </div>
                </div>
                <button 
                  onClick={() => setSelectedCoordinator(null)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 flex items-center justify-between group hover:border-violet-200 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-400 group-hover:text-violet-500 transition-colors shadow-sm">
                        <UserCircleIcon className="h-5 w-5" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">Docente Asignado {i + 1}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Programa de Ingeniería</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100 uppercase tracking-widest">Activo</span>
                      <button 
                        onClick={() => {
                          setSelectedCoordinator(null);
                          if (setView) setView('programs');
                        }}
                        className="p-2 text-slate-400 hover:text-violet-600 transition-colors"
                      >
                        <ChevronRightIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex justify-end">
                <button 
                  onClick={() => setSelectedCoordinator(null)}
                  className="glass-button-primary px-8 py-3 text-xs font-bold uppercase tracking-widest"
                >
                  Cerrar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
