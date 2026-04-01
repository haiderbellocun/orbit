import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  ArrowDownTrayIcon, 
  ExclamationCircleIcon, 
  CalendarIcon, 
  DocumentTextIcon, 
  CircleStackIcon, 
  ShieldCheckIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ClockIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { Teacher, Vacancy, Coordinator } from '@/src/types';

interface ExportViewProps {
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const ExportView: React.FC<ExportViewProps> = ({ 
  searchQuery = '', 
  setSearchQuery,
  searchResults 
}) => {
  const [selectedModule, setSelectedModule] = useState('teachers');
  const [selectedFormat, setSelectedFormat] = useState('csv');
  const [dateRange, setDateRange] = useState({ start: '2024-01-01', end: '2024-03-26' });

  const modules = [
    { id: 'teachers', label: 'Docentes', icon: CircleStackIcon, desc: 'Base completa de docentes' },
    { id: 'vacancies', label: 'Vacantes', icon: DocumentTextIcon, desc: 'Histórico de vacantes y estados' },
    { id: 'news', label: 'Novedades', icon: ClockIcon, desc: 'Periodo actual y auditoría' },
  ];

  const formats = [
    { id: 'csv', label: 'CSV', ext: '.csv' },
    { id: 'xlsx', label: 'Excel', ext: '.xlsx' },
    { id: 'json', label: 'JSON', ext: '.json' },
    { id: 'pdf', label: 'PDF', ext: '.pdf' },
  ];

  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerateReport = () => {
    setIsGenerating(true);
    // Simulate report generation
    setTimeout(() => {
      setIsGenerating(false);
      alert(`Reporte de ${selectedModule} en formato ${selectedFormat} generado y descargado exitosamente.`);
    }, 2000);
  };

  return (
    <div className="space-y-8 relative">
      {/* Decorative background elements */}
      <div className="absolute -top-20 -right-20 w-64 h-64 bg-violet-200/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-1/2 -left-20 w-64 h-64 bg-cyan-200/20 rounded-full blur-3xl pointer-events-none" />

      <Header 
        title="Exportación de Datos" 
        subtitle="Centralización para análisis externo y reportes" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 relative z-10">
        <div className="lg:col-span-4 space-y-6">
          <div className="glass-panel p-6">
            <h3 className="text-sm font-bold text-slate-900 mb-6 uppercase tracking-widest border-b border-slate-100 pb-2">Configurar Exportación</h3>
            
            <div className="space-y-6">
              {/* Module Selection */}
              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Módulo de Origen</label>
                <div className="space-y-2">
                  {modules.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setSelectedModule(m.id)}
                      className={cn(
                        "w-full p-3 rounded-xl border transition-all flex items-center gap-3 text-left group",
                        selectedModule === m.id 
                          ? "bg-violet-500/10 border-violet-500/30 text-violet-700 shadow-sm" 
                          : "bg-white/40 border-white/20 text-slate-500 hover:border-slate-200"
                      )}
                    >
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center transition-colors",
                        selectedModule === m.id ? "bg-violet-500 text-white" : "bg-slate-100 text-slate-400 group-hover:text-slate-600"
                      )}>
                        <m.icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-xs font-bold">{m.label}</p>
                        <p className="text-[10px] opacity-60">{m.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Rango de Fechas</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input 
                      type="date" 
                      className="glass-input pl-9 py-2 text-[10px] font-bold uppercase tracking-widest"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({...dateRange, start: e.target.value})}
                    />
                  </div>
                  <div className="relative">
                    <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                    <input 
                      type="date" 
                      className="glass-input pl-9 py-2 text-[10px] font-bold uppercase tracking-widest"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({...dateRange, end: e.target.value})}
                    />
                  </div>
                </div>
              </div>

              {/* Format Selection */}
              <div className="space-y-3">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Formato de Salida</label>
                <div className="grid grid-cols-2 gap-2">
                  {formats.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFormat(f.id)}
                      className={cn(
                        "py-2.5 rounded-xl border text-[10px] font-bold uppercase tracking-widest transition-all",
                        selectedFormat === f.id 
                          ? "bg-slate-900 border-slate-900 text-white shadow-lg" 
                          : "bg-white/40 border-white/20 text-slate-500 hover:border-slate-200"
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4">
                <button 
                  onClick={handleGenerateReport}
                  disabled={isGenerating}
                  className="glass-button-primary w-full py-4 flex items-center justify-center gap-2 group disabled:opacity-50"
                >
                  <ArrowDownTrayIcon className="h-5 w-5 group-hover:translate-y-0.5 transition-transform" />
                  <span className="text-xs font-bold uppercase tracking-widest">
                    {isGenerating ? 'Generando...' : 'Generar Reporte'}
                  </span>
                </button>
              </div>
            </div>
          </div>
          
          <div className="glass-panel p-6 bg-amber-50/50 border-amber-200/50 backdrop-blur-md">
            <div className="flex gap-3">
              <ShieldCheckIcon className="h-5 w-5 text-amber-600 shrink-0" />
              <div>
                <h4 className="text-sm font-bold text-amber-900 font-display">Protección de Datos</h4>
                <p className="text-[10px] text-amber-700 mt-1 leading-relaxed font-medium uppercase tracking-wide">
                  Este reporte contiene PII. El acceso está registrado en los logs de auditoría institucional.
                </p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-8">
          <div className="glass-panel p-8 h-full flex flex-col">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-display">Vista Previa del Dataset</h3>
                <p className="text-xs text-slate-500 font-medium">Módulo: <span className="text-violet-600 uppercase font-bold">{selectedModule}</span> • Formato: <span className="text-violet-600 uppercase font-bold">{selectedFormat}</span></p>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Sincronizado</span>
              </div>
            </div>

            <div className="flex-1 bg-slate-900/95 backdrop-blur-xl rounded-2xl p-6 font-mono text-xs text-emerald-400/90 overflow-auto no-scrollbar border border-white/10 shadow-2xl relative group">
              <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg text-white transition-colors">
                  <ChevronRightIcon className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className="leading-relaxed">
{`{
  "export_id": "ORB-2024-03-26-001",
  "timestamp": "${new Date().toISOString()}",
  "module": "${selectedModule}",
  "format": "${selectedFormat}",
  "range": {
    "from": "${dateRange.start}",
    "to": "${dateRange.end}"
  },
  "data": [
    {
      "id": "1",
      "name": "Alejandro Martínez",
      "document": "10203040",
      "program": "Ingeniería",
      "status": "active"
    },
    {
      "id": "2",
      "name": "Elena Rodríguez",
      "document": "50607080",
      "program": "Diseño",
      "status": "active"
    },
    {
      "id": "3",
      "name": "Carlos Poveda",
      "document": "90102030",
      "program": "Administración",
      "status": "active"
    }
  ]
}`}
              </pre>
            </div>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Registros</p>
                <p className="text-xl font-bold text-slate-900">1,240</p>
              </div>
              <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tamaño Est.</p>
                <p className="text-xl font-bold text-slate-900">2.4 MB</p>
              </div>
              <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Integridad</p>
                <div className="flex items-center gap-2 text-emerald-600">
                  <CheckCircleIcon className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-widest">Validado</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
