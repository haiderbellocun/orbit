import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  UsersIcon, 
  ArrowPathIcon, 
  CheckCircleIcon, 
  ClockIcon, 
  XCircleIcon, 
  FunnelIcon, 
  PlusIcon, 
  MagnifyingGlassIcon, 
  EllipsisHorizontalIcon,
  ArrowRightIcon,
  XMarkIcon,
  CalendarIcon,
  DocumentTextIcon,
  ChatBubbleLeftEllipsisIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Reinstatement, Teacher, Vacancy, Coordinator } from '@/src/types';
import { getReinstatements } from '@/src/lib/api';

function mapReinstatementFromApi(row: Record<string, unknown>): Reinstatement {
  const finalD =
    row.final_decision != null ? String(row.final_decision).trim() : '';
  const dec = row.decision != null ? String(row.decision).trim() : '';
  const src = finalD || dec;

  let status: Reinstatement['status'] = 'pending';
  if (src === 'Reintegro') status = 'approved';
  else if (src === 'Finalizacion Contrato') status = 'rejected';

  const date =
    row.start_date != null ? String(row.start_date).slice(0, 10) : '';

  return {
    id: String(row.id ?? ''),
    teacherId: String(row.program ?? ''),
    teacherName: String(row.teacher_name ?? ''),
    period: String(row.period ?? ''),
    status,
    date,
    reason: String(row.observations ?? ''),
  };
}

interface ReinstatementsViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const ReinstatementsView: React.FC<ReinstatementsViewProps> = ({ 
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const [reinstatements, setReinstatements] = useState<Reinstatement[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const listKeyRef = useRef<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    teacherName: '',
    teacherId: '',
    period: '2024-1',
    reason: '',
    date: new Date().toISOString().split('T')[0],
  });

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

        const res = await getReinstatements({
          page: pageToUse,
          limit: 50,
        });
        if (!cancelled) {
          const list = Array.isArray(res.data)
            ? res.data.map((r) =>
                mapReinstatementFromApi(r as Record<string, unknown>)
              )
            : [];
          setReinstatements(list);
          setTotalCount(res.pagination?.total ?? 0);
          setTotalPages(res.pagination?.totalPages ?? 0);
        }
      } catch {
        if (!cancelled) {
          setReinstatements([]);
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

  const filteredReinstatements = useMemo(() => {
    return reinstatements.filter(r => 
      r.teacherName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.reason.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [reinstatements, searchQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newReinstatement: Reinstatement = {
      id: `R${reinstatements.length + 1}`,
      teacherId: formData.teacherId,
      teacherName: formData.teacherName,
      period: formData.period,
      status: 'pending',
      date: formData.date,
      reason: formData.reason
    };
    setReinstatements([newReinstatement, ...reinstatements]);
    setFormData({
      teacherName: '',
      teacherId: '',
      period: '2024-1',
      reason: '',
      date: new Date().toISOString().split('T')[0]
    });
    setShowForm(false);
  };

  return (
    <div className="space-y-8 relative">
      {/* Decorative background elements */}
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 dark:bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      <Header 
        title="Gestión de Reintegros" 
        subtitle="Procesamiento de retornos de docentes" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative z-10">
        {[
          { label: 'Pendientes', count: reinstatements.filter(r => r.status === 'pending').length, icon: ClockIcon, color: 'text-orbit-warning', bg: 'bg-orbit-warning/10', border: 'border-orbit-warning/30' },
          { label: 'Aprobados', count: reinstatements.filter(r => r.status === 'approved').length, icon: CheckCircleIcon, color: 'text-orbit-success', bg: 'bg-orbit-success/10', border: 'border-orbit-success/30' },
          { label: 'Rechazados', count: reinstatements.filter(r => r.status === 'rejected').length, icon: XCircleIcon, color: 'text-orbit-danger', bg: 'bg-orbit-danger/10', border: 'border-orbit-danger/30' },
        ].map((stat, i) => (
          <div key={i} className={cn("glass-card p-6 flex items-center gap-4 border-l-4", stat.border)}>
            <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center backdrop-blur-md", stat.bg, stat.color)}>
              <stat.icon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-orbit-muted font-display">{stat.label}</p>
              <h3 className="text-2xl font-bold text-orbit-text">{stat.count}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="glass-panel p-6 relative z-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
          <h3 className="text-lg font-bold text-orbit-text font-display">Solicitudes Recientes</h3>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
              <input 
                type="text" 
                placeholder="Buscar docente..." 
                className="glass-input w-full pl-9 pr-4 py-2 text-sm" 
                value={searchQuery}
                onChange={(e) => setSearchQuery?.(e.target.value)}
              />
            </div>
            <button className="glass-button-secondary p-2">
              <FunnelIcon className="h-4.5 w-4.5" />
            </button>
            <button 
              onClick={() => setShowForm(true)}
              className="glass-button-primary flex items-center gap-2 px-4 py-2 text-sm"
            >
              <PlusIcon className="h-4.5 w-4.5" />
              <span>Nuevo Reintegro</span>
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="h-10 w-10 rounded-full border-2 border-orbit-primary border-t-transparent animate-spin" />
            <p className="text-sm font-medium text-orbit-text-secondary">Cargando...</p>
          </div>
        ) : filteredReinstatements.length > 0 ? (
          <div className="space-y-4">
            {filteredReinstatements.map((r) => (
              <motion.div 
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-card p-4 hover:border-orbit-primary/40/50 transition-all group"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-50 to-slate-100 dark:from-orbit-elevated dark:to-orbit-surface flex items-center justify-center text-orbit-muted group-hover:text-orbit-primary transition-colors shadow-inner">
                      <UsersIcon className="h-6 w-6" />
                    </div>
                    <div>
                      <h4 className="font-bold text-orbit-text group-hover:text-orbit-primary transition-colors">{r.teacherName}</h4>
                      <p className="text-xs text-orbit-muted font-medium">Periodo: {r.period} • <span className="font-mono text-orbit-muted">ID: {r.id}</span></p>
                    </div>
                  </div>
                  
                  <div className="flex-1 md:px-8">
                    <p className="text-sm text-orbit-text-secondary italic font-medium leading-relaxed">"{r.reason}"</p>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <p className="text-[10px] text-orbit-muted font-bold uppercase tracking-widest mb-1">{r.date}</p>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-lg border",
                        r.status === 'approved' ? "bg-orbit-success/10 text-orbit-success border-orbit-success/25" : 
                        r.status === 'pending' ? "bg-orbit-warning/10 text-orbit-warning border-orbit-warning/30" : "bg-red-50 dark:bg-red-500/12 text-red-600 dark:text-red-300 border-red-100 dark:border-red-500/25"
                      )}>
                        {r.status === 'approved' ? 'Aprobado' : r.status === 'pending' ? 'Pendiente' : 'Rechazado'}
                      </span>
                    </div>
                    <button className="glass-button-secondary p-2">
                      <EllipsisHorizontalIcon className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-panel p-20 flex flex-col items-center justify-center text-center relative z-10"
          >
            <div className="w-24 h-24 rounded-full bg-orbit-bg-secondary flex items-center justify-center text-orbit-muted mb-6">
              <MagnifyingGlassIcon className="h-12 w-12" />
            </div>
            <h3 className="text-xl font-bold text-orbit-text mb-2 font-display">No se encontraron resultados</h3>
            <p className="text-orbit-muted max-w-md">Intenta ajustar los criterios de búsqueda para encontrar lo que necesitas.</p>
            <button 
              onClick={() => setSearchQuery?.('')}
              className="text-orbit-primary font-bold text-xs uppercase tracking-widest hover:underline pt-4"
            >
              Limpiar búsqueda
            </button>
          </motion.div>
        )}

        {!loading && totalCount > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8 mt-4 border-t border-orbit-border">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="glass-button-secondary px-6 py-3 text-xs font-bold uppercase tracking-widest disabled:opacity-40 disabled:pointer-events-none"
            >
              Anterior
            </button>
            <p className="text-sm font-medium text-orbit-text-secondary">
              Página {currentPage} de {Math.max(totalPages, 1)} ({totalCount}{" "}
              reintegros)
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
      </div>

      {/* New Reinstatement Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowForm(false)}
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl glass-panel p-8 relative z-10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500"></div>
              
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-orbit-primary/10 flex items-center justify-center text-orbit-primary">
                    <ArrowPathIcon className="h-6 w-6" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-orbit-text font-display">Nuevo Reintegro</h2>
                    <p className="text-xs text-orbit-muted font-medium tracking-wide uppercase">Registro de retorno docente</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowForm(false)}
                  className="p-2 hover:bg-orbit-interactive rounded-xl transition-colors text-orbit-muted"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest ml-1">Nombre del Docente</label>
                    <div className="relative">
                      <UsersIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
                      <input 
                        type="text" 
                        required
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="Ej: Alejandro Martínez"
                        value={formData.teacherName}
                        onChange={(e) => setFormData({...formData, teacherName: e.target.value})}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest ml-1">ID / Documento</label>
                    <div className="relative">
                      <DocumentTextIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
                      <input 
                        type="text" 
                        required
                        className="glass-input pl-12 py-3 text-sm" 
                        placeholder="Número de identificación"
                        value={formData.teacherId}
                        onChange={(e) => setFormData({...formData, teacherId: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest ml-1">Periodo Académico</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
                      <select 
                        className="glass-input pl-12 py-3 text-sm appearance-none"
                        value={formData.period}
                        onChange={(e) => setFormData({...formData, period: e.target.value})}
                      >
                        <option value="2024-1">2024-1</option>
                        <option value="2024-2">2024-2</option>
                        <option value="2025-1">2025-1</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest ml-1">Fecha de Solicitud</label>
                    <div className="relative">
                      <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-orbit-muted" />
                      <input 
                        type="date" 
                        required
                        className="glass-input pl-12 py-3 text-sm" 
                        value={formData.date}
                        onChange={(e) => setFormData({...formData, date: e.target.value})}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-bold text-orbit-muted uppercase tracking-widest ml-1">Motivo del Reintegro</label>
                  <div className="relative">
                    <ChatBubbleLeftEllipsisIcon className="absolute left-4 top-4 h-4 w-4 text-orbit-muted" />
                    <textarea 
                      required
                      rows={3}
                      className="glass-input pl-12 py-3 text-sm resize-none" 
                      placeholder="Describa brevemente el motivo del retorno..."
                      value={formData.reason}
                      onChange={(e) => setFormData({...formData, reason: e.target.value})}
                    />
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
                    Crear Solicitud
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
