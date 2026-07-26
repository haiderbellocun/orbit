import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  RectangleGroupIcon, 
  UsersIcon, 
  MapPinIcon, 
  BookOpenIcon, 
  ClockIcon,
  ArrowLeftIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { View, Teacher, Vacancy, Coordinator } from '@/src/types';

interface ProgramsViewProps {
  setView: (v: View) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const ProgramsView: React.FC<ProgramsViewProps> = ({ 
  setView,
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const programs = [
    { id: '1', name: 'Ingeniería de Sistemas', campus: 'Sede Norte', coordinator: 'Juan Pérez', teachers: 45, credits: 160, duration: '10 Semestres' },
    { id: '2', name: 'Diseño Visual', campus: 'Sede Centro', coordinator: 'Marta Lucía', teachers: 32, credits: 145, duration: '9 Semestres' },
    { id: '3', name: 'Arquitectura', campus: 'Sede Sur', coordinator: 'Ricardo Silva', teachers: 28, credits: 170, duration: '10 Semestres' },
  ];

  const filteredPrograms = useMemo(() => {
    return programs.filter(p => 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.campus.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.coordinator.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="space-y-10">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setView('home')}
          className="p-2 hover:bg-white/50 rounded-xl transition-colors text-slate-400 hover:text-violet-600"
        >
          <ArrowLeftIcon className="h-6 w-6" />
        </button>
        <Header 
          title="Programas Académicos" 
          subtitle="Información detallada de la oferta educativa" 
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          searchResults={searchResults}
        />
      </div>

      {filteredPrograms.length === 0 ? (
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-20 flex flex-col items-center justify-center text-center space-y-4"
        >
          <div className="w-20 h-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-white/50 shadow-inner">
            <MagnifyingGlassIcon className="h-10 w-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-slate-900 font-display">No se encontraron programas</h3>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              No pudimos encontrar programas que coincidan con tu búsqueda actual.
            </p>
          </div>
          <button 
            onClick={() => setSearchQuery?.('')}
            className="text-violet-600 font-bold text-xs uppercase tracking-widest hover:underline pt-4"
          >
            Ver todos los programas
          </button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredPrograms.map((program) => (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={program.id}
              className="glass-card p-8 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-violet-500/5 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-500"></div>
              
              <div className="w-16 h-16 rounded-2xl bg-violet-50 flex items-center justify-center text-violet-600 mb-6 group-hover:scale-110 transition-transform">
                <BookOpenIcon className="h-8 w-8" />
              </div>

              <h3 className="text-xl font-bold text-slate-900 group-hover:text-violet-600 transition-colors font-display mb-2">{program.name}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">
                <MapPinIcon className="h-3 w-3" />
                <span>{program.campus}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-3 bg-slate-50/50 rounded-xl border border-white/40">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Docentes</p>
                  <p className="text-lg font-bold text-slate-900">{program.teachers}</p>
                </div>
                <div className="p-3 bg-slate-50/50 rounded-xl border border-white/40">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Créditos</p>
                  <p className="text-lg font-bold text-slate-900">{program.credits}</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Coordinador:</span>
                  <span className="font-bold text-slate-900">{program.coordinator}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">Duración:</span>
                  <span className="font-bold text-slate-900">{program.duration}</span>
                </div>
              </div>

              <button className="w-full mt-8 py-3 glass-button-secondary text-xs font-bold uppercase tracking-widest">
                Ver Plan de Estudios
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};
