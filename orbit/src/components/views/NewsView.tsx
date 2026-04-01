import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { 
  BellIcon, 
  ExclamationCircleIcon, 
  CalendarIcon, 
  ClockIcon, 
  EllipsisHorizontalIcon, 
  PlusIcon, 
  MagnifyingGlassIcon, 
  FunnelIcon,
  UserIcon,
  InformationCircleIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { NewsItem, Teacher, Vacancy, Coordinator } from '@/src/types';

const MOCK_NEWS: NewsItem[] = [
  { id: 'N1', teacherName: 'Elena Rodríguez', type: 'incapacity', severity: 'high', date: '2024-03-24', description: 'Incapacidad médica por 15 días debido a cirugía programada.' },
  { id: 'N2', teacherName: 'Carlos Poveda', type: 'license', severity: 'medium', date: '2024-03-22', description: 'Licencia de paternidad solicitada para el mes de Abril.' },
  { id: 'N3', teacherName: 'Sofía Herrera', type: 'other', severity: 'low', date: '2024-03-20', description: 'Cambio de horario solicitado para el bloque de los viernes.' },
];

interface NewsViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const NewsView: React.FC<NewsViewProps> = ({ 
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const [newsList, setNewsList] = React.useState<NewsItem[]>(MOCK_NEWS);
  const [newReport, setNewReport] = React.useState({
    teacherName: '',
    type: 'other' as NewsItem['type'],
    description: ''
  });

  const filteredNews = useMemo(() => {
    return newsList.filter(n => 
      n.teacherName.toLowerCase().includes(searchQuery.toLowerCase()) || 
      n.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.type.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, newsList]);

  const handleSaveReport = () => {
    if (!newReport.teacherName || !newReport.description) {
      alert('Por favor complete todos los campos.');
      return;
    }

    const newItem: NewsItem = {
      id: `N${newsList.length + 1}`,
      teacherName: newReport.teacherName,
      type: newReport.type,
      severity: newReport.type === 'incapacity' ? 'high' : newReport.type === 'license' ? 'medium' : 'low',
      date: new Date().toISOString().split('T')[0],
      description: newReport.description
    };

    setNewsList([newItem, ...newsList]);
    setNewReport({ teacherName: '', type: 'other', description: '' });
    alert('Novedad registrada exitosamente.');
  };

  return (
    <div className="space-y-8 relative">
      {/* Decorative background elements */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header 
        title="Novedades y Reportes" 
        subtitle="Seguimiento de cambios y alertas operativas" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        <div className="lg:col-span-8 space-y-6">
          <div className="glass-panel p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
              <h3 className="text-lg font-bold text-slate-900 font-display">Feed de Novedades</h3>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="glass-panel p-1 flex items-center gap-2 flex-1 sm:flex-none">
                  <MagnifyingGlassIcon className="ml-2 h-3.5 w-3.5 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Buscar novedades..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery?.(e.target.value)}
                    className="bg-transparent border-none focus:ring-0 text-xs py-1 w-full sm:w-40"
                  />
                </div>
                <button className="glass-button-secondary p-2 shrink-0">
                  <FunnelIcon className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-6">
              {filteredNews.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 border border-white/50 shadow-inner">
                    <MagnifyingGlassIcon className="h-8 w-8" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-lg font-bold text-slate-900 font-display">No se encontraron novedades</h3>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      No pudimos encontrar novedades que coincidan con tu búsqueda actual.
                    </p>
                  </div>
                </div>
              ) : (
                filteredNews.map((news) => (
                  <motion.div 
                    key={news.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="relative pl-6 border-l-2 border-slate-200/50 hover:border-violet-400 transition-colors group"
                  >
                    <div className={cn(
                      "absolute -left-[9px] top-0 w-4 h-4 rounded-full border-4 border-white shadow-sm",
                      news.severity === 'high' ? "bg-red-500" : 
                      news.severity === 'medium' ? "bg-amber-500" : "bg-blue-500"
                    )}></div>
                    
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-bold text-slate-900 group-hover:text-violet-600 transition-colors">{news.teacherName}</h4>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">{news.date}</span>
                          <span className={cn(
                            "text-[10px] font-bold uppercase px-2 py-0.5 rounded-md border",
                            news.type === 'incapacity' ? "bg-red-50 text-red-600 border-red-100" : 
                            news.type === 'license' ? "bg-blue-50 text-blue-600 border-blue-100" : "bg-slate-50 text-slate-600 border-slate-100"
                          )}>
                            {news.type}
                          </span>
                        </div>
                      </div>
                      <button className="glass-button-secondary p-1">
                        <EllipsisHorizontalIcon className="h-4.5 w-4.5" />
                      </button>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                      {news.description}
                    </p>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-6 bg-white border-white/50 shadow-xl overflow-hidden relative group">
            {/* Subtle pattern background */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#8B5CF6 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
            
            {/* Decorative glows / Sparkles */}
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-violet-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
            <div className="absolute -bottom-10 -left-10 w-32 h-32 bg-fuchsia-500/5 rounded-full blur-2xl" />
            
            <div className="relative z-10">
              <h3 className="font-bold mb-4 font-display text-lg text-slate-900">Registrar Novedad</h3>
              <p className="text-xs text-slate-500 mb-6 font-medium">Complete el formulario para reportar una novedad operativa en el sistema.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Docente</label>
                  <input 
                    type="text"
                    placeholder="Nombre del docente..."
                    value={newReport.teacherName}
                    onChange={(e) => setNewReport({...newReport, teacherName: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 focus:bg-white transition-all"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Tipo de Novedad</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'incapacity', label: 'Incapacidad' },
                      { id: 'license', label: 'Licencia' },
                      { id: 'resignation', label: 'Renuncia' },
                      { id: 'other', label: 'Otro' }
                    ].map((type) => (
                      <button 
                        key={type.id} 
                        onClick={() => setNewReport({...newReport, type: type.id as NewsItem['type']})}
                        className={cn(
                          "p-2 border rounded-lg text-[10px] font-bold transition-all",
                          newReport.type === type.id 
                            ? "bg-violet-500 border-violet-500 text-white shadow-lg shadow-violet-500/20" 
                            : "bg-slate-50 border-slate-100 text-slate-500 hover:bg-slate-100"
                        )}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 ml-1">Descripción</label>
                  <textarea 
                    value={newReport.description}
                    onChange={(e) => setNewReport({...newReport, description: e.target.value})}
                    className="w-full bg-slate-50 border border-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-violet-400 focus:bg-white transition-all h-24 resize-none"
                    placeholder="Detalles de la novedad..."
                  ></textarea>
                </div>
                <button 
                  onClick={handleSaveReport}
                  className="glass-button-primary w-full py-3 text-sm font-bold tracking-widest uppercase shadow-lg shadow-violet-500/20"
                >
                  Guardar Reporte
                </button>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2 font-display">
              <InformationCircleIcon className="h-4.5 w-4.5 text-violet-500" />
              Impacto Operativo
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-xl bg-red-50/50 border border-red-100/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Clases Afectadas</span>
                <span className="text-lg font-bold text-red-600">12</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50/50 border border-slate-100/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Docentes en Reemplazo</span>
                <span className="text-lg font-bold text-slate-900">4</span>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/50 border border-amber-100/50">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Horas por Cubrir</span>
                <span className="text-lg font-bold text-amber-600">48h</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
