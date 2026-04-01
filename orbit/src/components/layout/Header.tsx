import React from 'react';
import { motion } from 'motion/react';
import { 
  MagnifyingGlassIcon, 
  BellIcon, 
  UserIcon, 
  BriefcaseIcon, 
  UserCircleIcon 
} from '@heroicons/react/24/solid';
import { Teacher, Vacancy, Coordinator } from '@/src/types';

interface HeaderProps {
  title: string;
  subtitle?: string;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const Header: React.FC<HeaderProps> = ({ 
  title, 
  subtitle, 
  searchQuery = '', 
  setSearchQuery,
  searchResults
}) => {
  const hasResults = searchResults && (
    searchResults.teachers.length > 0 || 
    searchResults.vacancies.length > 0 || 
    searchResults.coordinators.length > 0
  );

  return (
    <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-20">
      <div className="space-y-1">
        <motion.h1 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="text-4xl font-bold tracking-tight text-slate-900 font-display"
        >
          {title}
        </motion.h1>
        {subtitle && (
          <motion.p 
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 }}
            className="text-slate-500 font-medium tracking-wide flex items-center gap-2"
          >
            <span className="w-8 h-[1px] bg-violet-200"></span>
            {subtitle}
          </motion.p>
        )}
      </div>
      
      <div className="flex items-center gap-4 w-full md:w-auto">
        <div className="relative group flex-1 md:flex-none">
          <MagnifyingGlassIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-violet-500 transition-colors h-[18px] w-[18px]" />
          <input 
            type="text" 
            placeholder="Buscar en Orbit..." 
            className="glass-input pl-12 w-full md:w-72 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery?.(e.target.value)}
          />

          {/* Search Results Dropdown */}
          {searchQuery && (
            <div className="absolute top-full left-0 right-0 mt-2 glass-panel p-4 shadow-2xl space-y-4 max-h-96 overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-200">
              {!hasResults ? (
                <p className="text-center py-4 text-sm text-slate-500 font-medium italic">No se encontraron resultados para "{searchQuery}"</p>
              ) : (
                <>
                  {searchResults.teachers.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest mb-2 px-2">Docentes</p>
                      {searchResults.teachers.map(t => (
                        <button key={t.id} className="w-full text-left p-2 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-3 group">
                          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center text-violet-500 group-hover:bg-violet-500 group-hover:text-white transition-all">
                            <UserIcon className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{t.name}</p>
                            <p className="text-[10px] text-slate-400">{t.program}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.vacancies.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-cyan-500 uppercase tracking-widest mb-2 px-2">Vacantes</p>
                      {searchResults.vacancies.map(v => (
                        <button key={v.id} className="w-full text-left p-2 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-3 group">
                          <div className="w-8 h-8 rounded-lg bg-cyan-50 flex items-center justify-center text-cyan-500 group-hover:bg-cyan-500 group-hover:text-white transition-all">
                            <BriefcaseIcon className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{v.title}</p>
                            <p className="text-[10px] text-slate-400">{v.program}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                  {searchResults.coordinators.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold text-fuchsia-500 uppercase tracking-widest mb-2 px-2">Coordinadores</p>
                      {searchResults.coordinators.map(c => (
                        <button key={c.id} className="w-full text-left p-2 hover:bg-slate-50 rounded-xl transition-colors flex items-center gap-3 group">
                          <div className="w-8 h-8 rounded-lg bg-fuchsia-50 flex items-center justify-center text-fuchsia-500 group-hover:bg-fuchsia-500 group-hover:text-white transition-all">
                            <UserCircleIcon className="h-3.5 w-3.5" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">{c.name}</p>
                            <p className="text-[10px] text-slate-400">{c.campus}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
        
        <button className="glass-button-secondary p-3 relative group">
          <BellIcon className="h-5 w-5 group-hover:rotate-12 transition-transform" />
          <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-gradient-to-tr from-rose-500 to-pink-500 rounded-full border-2 border-white shadow-sm"></span>
        </button>
        
        <div className="flex items-center gap-4 pl-4 border-l border-white/40">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-bold text-slate-900">Danna Poveda</p>
            <p className="text-[10px] uppercase tracking-widest font-bold text-violet-500">Administrador</p>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-violet-100 to-fuchsia-100 flex items-center justify-center text-violet-600 font-bold shadow-inner border border-white/50">
            DP
          </div>
        </div>
      </div>
    </header>
  );
};
