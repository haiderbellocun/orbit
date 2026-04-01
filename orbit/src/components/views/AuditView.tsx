import React, { useMemo } from 'react';
import { 
  CalendarIcon, 
  ArrowDownTrayIcon, 
  FunnelIcon, 
  MagnifyingGlassIcon, 
  UserCircleIcon, 
  ArrowTopRightOnSquareIcon, 
  ClockIcon 
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { AuditEvent, Teacher, Vacancy, Coordinator } from '@/src/types';

const MOCK_AUDIT: AuditEvent[] = [
  { id: 'A1', user: 'Admin User', action: 'Actualización de Perfil', module: 'Docentes', date: '2024-03-25 10:30', details: 'Se modificó el estado de Carlos Poveda a "En Licencia"' },
  { id: 'A2', user: 'Admin User', action: 'Creación de Vacante', module: 'Vacantes', date: '2024-03-25 09:15', details: 'Nueva vacante para Ingeniería de Sistemas' },
  { id: 'A3', user: 'Coordinador Norte', action: 'Registro de Novedad', module: 'Novedades', date: '2024-03-24 16:45', details: 'Reporte de incapacidad médica - Elena Rodríguez' },
];

interface AuditViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const AuditView: React.FC<AuditViewProps> = ({ 
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const filteredAudit = useMemo(() => {
    return MOCK_AUDIT.filter(a => 
      a.user.toLowerCase().includes(searchQuery.toLowerCase()) || 
      a.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.details.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  return (
    <div className="space-y-8 relative">
      {/* Decorative background elements */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header 
        title="Trazabilidad y Auditoría" 
        subtitle="Historial inteligente de eventos del sistema" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <button className="glass-button-secondary flex items-center gap-2 px-4 py-2.5 text-sm">
            <CalendarIcon className="h-4.5 w-4.5" />
            <span>Últimos 30 días</span>
          </button>
          <button className="glass-button-secondary flex items-center gap-2 px-4 py-2.5 text-sm">
            <ArrowDownTrayIcon className="h-4.5 w-4.5" />
            <span>Exportar Log</span>
          </button>
        </div>
      </div>

      <div className="glass-panel overflow-hidden relative z-10">
        <div className="p-6 border-b border-white/20 bg-white/30 backdrop-blur-md flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white/50 border border-white/20 rounded-lg text-[10px] font-bold text-slate-600 uppercase tracking-widest shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
              <span>Sistemas OK</span>
            </div>
            <p className="text-sm text-slate-500 font-medium">Mostrando <span className="text-slate-900 font-bold">{filteredAudit.length}</span> eventos registrados</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="glass-panel p-1 flex items-center gap-2">
              <MagnifyingGlassIcon className="ml-2 h-3.5 w-3.5 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar auditoría..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery?.(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-xs py-1 w-40"
              />
            </div>
            <button className="glass-button-secondary p-2">
              <FunnelIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        
        <div className="divide-y divide-white/10">
          {filteredAudit.length === 0 ? (
            <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-white/50 shadow-inner">
                <MagnifyingGlassIcon className="h-8 w-8" />
              </div>
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-slate-900 font-display">No se encontraron eventos</h3>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  No pudimos encontrar eventos que coincidan con tu búsqueda actual.
                </p>
              </div>
            </div>
          ) : (
            filteredAudit.map((event) => (
              <div key={event.id} className="p-6 hover:bg-white/40 transition-all flex flex-col md:flex-row md:items-center gap-6 group">
                <div className="flex items-center gap-4 md:w-64 shrink-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-50 to-fuchsia-50 flex items-center justify-center text-violet-500 group-hover:scale-110 transition-transform shadow-sm">
                    <UserCircleIcon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900 group-hover:text-violet-600 transition-colors">{event.user}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{event.date}</p>
                  </div>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 bg-white/50 border border-white/20 text-slate-500 text-[9px] font-bold rounded uppercase tracking-[0.15em] shadow-sm">
                      {event.module}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900">{event.action}</h4>
                  </div>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">{event.details}</p>
                </div>
                
                <div className="md:w-32 flex justify-end">
                  <button className="glass-button-secondary p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowTopRightOnSquareIcon className="h-4.5 w-4.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-6 bg-white/20 backdrop-blur-sm border-t border-white/10 flex items-center justify-center">
          <button className="text-xs font-bold text-violet-600 hover:text-violet-700 uppercase tracking-widest transition-colors">
            Cargar más eventos
          </button>
        </div>
      </div>
    </div>
  );
};
