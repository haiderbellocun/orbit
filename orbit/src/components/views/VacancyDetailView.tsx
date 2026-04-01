import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ChevronLeftIcon, 
  BriefcaseIcon, 
  MapPinIcon, 
  RectangleGroupIcon, 
  UserIcon, 
  CalendarIcon, 
  ClockIcon, 
  DocumentTextIcon, 
  ChatBubbleLeftEllipsisIcon, 
  UserPlusIcon, 
  ArrowPathIcon, 
  PlusIcon,
  CheckCircleIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/solid';
import { Vacancy, View } from '@/src/types';
import { cn } from '@/src/lib/utils';

interface VacancyDetailViewProps {
  vacancy: Vacancy;
  setView: (v: View) => void;
}

type Tab = 'details' | 'requirements' | 'observations' | 'tracking';

export const VacancyDetailView: React.FC<VacancyDetailViewProps> = ({ vacancy, setView }) => {
  const [activeTab, setActiveTab] = useState<Tab>('details');
  const [isAssigning, setIsAssigning] = useState(false);
  const [isAddingObservation, setIsAddingObservation] = useState(false);
  const [isScheduling, setIsScheduling] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [observations, setObservations] = useState([
    { user: 'Juan Pérez', date: '2024-03-21', text: 'Se inició la revisión de perfiles recibidos por la plataforma.' },
    { user: 'Marta Lucía', date: '2024-03-22', text: 'Pendiente validación de presupuesto para esta vacante.' }
  ]);

  const handleAddObservation = () => {
    const text = prompt('Ingrese la observación:');
    if (text) {
      setObservations([
        { user: 'Admin User', date: new Date().toISOString().split('T')[0], text },
        ...observations
      ]);
    }
  };

  const handleAssignTeacher = () => {
    const teacherName = prompt('Ingrese el nombre del docente a asignar:');
    if (teacherName) {
      alert(`Docente ${teacherName} asignado a la vacante exitosamente.`);
    }
  };

  const handleScheduleInterview = () => {
    const date = prompt('Ingrese la fecha de la entrevista (YYYY-MM-DD):');
    if (date) {
      alert(`Entrevista agendada para el ${date} exitosamente.`);
    }
  };

  const handleCancelVacancy = () => {
    if (confirm('¿Está seguro de que desea cancelar esta vacante?')) {
      alert('Vacante cancelada exitosamente.');
      setView('vacancies');
    }
  };

  const tabs = [
    { id: 'details', label: 'Detalles', icon: DocumentTextIcon },
    { id: 'requirements', label: 'Requisitos', icon: RectangleGroupIcon },
    { id: 'observations', label: 'Observaciones', icon: ChatBubbleLeftEllipsisIcon },
    { id: 'tracking', label: 'Seguimiento', icon: ClockIcon },
  ];

  return (
    <div className="space-y-8">
      <button 
        onClick={() => setView('vacancies')}
        className="flex items-center gap-2 text-slate-500 hover:text-violet-600 transition-colors font-bold text-xs uppercase tracking-widest group"
      >
        <ChevronLeftIcon className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
        <span>Volver a Vacantes</span>
      </button>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white shadow-xl shadow-violet-500/20 shrink-0">
            <BriefcaseIcon className="h-6 w-6 sm:h-8 sm:w-8" />
          </div>
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-1">
              <h1 className="text-xl sm:text-3xl font-display font-bold text-slate-900 tracking-tight">{vacancy.title}</h1>
              <span className={cn(
                "w-fit px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest border shadow-sm",
                vacancy.status === 'open' ? "bg-blue-50 text-blue-600 border-blue-100" :
                vacancy.status === 'in-progress' ? "bg-amber-50 text-amber-600 border-amber-100" :
                "bg-emerald-50 text-emerald-600 border-emerald-100"
              )}>
                {vacancy.status === 'open' ? 'Abierta' : vacancy.status === 'in-progress' ? 'En Proceso' : 'Cubierta'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <MapPinIcon className="h-3.5 w-3.5 text-cyan-500" />
                <span>{vacancy.campus}</span>
              </div>
              <span className="hidden sm:block w-1 h-1 rounded-full bg-slate-300"></span>
              <div className="flex items-center gap-1.5">
                <RectangleGroupIcon className="h-3.5 w-3.5 text-violet-500" />
                <span>{vacancy.program}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button className="flex-1 sm:flex-none glass-button-secondary px-4 py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2">
            <ArrowPathIcon className="h-4 w-4" />
            <span>Estado</span>
          </button>
          <button 
            onClick={handleAssignTeacher}
            className="flex-[2] sm:flex-none glass-button-primary px-6 py-2.5 text-[10px] sm:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2"
          >
            <UserPlusIcon className="h-4 w-4" />
            <span>Asignar</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Tabs Navigation */}
          <div className="glass-panel p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                className={cn(
                  "flex-1 min-w-[100px] flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-widest transition-all duration-300",
                  activeTab === tab.id 
                    ? "bg-white text-violet-600 shadow-sm border border-white/50" 
                    : "text-slate-400 hover:text-slate-600 hover:bg-white/40"
                )}
              >
                <tab.icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="glass-panel p-8 min-h-[400px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'details' && (
                  <div className="space-y-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Información General</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500 font-medium">Fecha de Creación</span>
                            <span className="text-xs text-slate-900 font-bold">{vacancy.createdAt}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500 font-medium">Prioridad</span>
                            <span className={cn(
                              "text-[10px] font-bold uppercase px-2 py-0.5 rounded-md",
                              vacancy.priority === 'high' ? "text-red-600 bg-red-50" : "text-slate-600 bg-slate-50"
                            )}>{vacancy.priority}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500 font-medium">Coordinador Responsable</span>
                            <span className="text-xs text-slate-900 font-bold">{vacancy.coordinator}</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Carga Académica</h3>
                        <div className="space-y-3">
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500 font-medium">Horas Semanales</span>
                            <span className="text-xs text-slate-900 font-bold">12 Horas</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500 font-medium">Modalidad</span>
                            <span className="text-xs text-slate-900 font-bold">Presencial</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500 font-medium">Jornada</span>
                            <span className="text-xs text-slate-900 font-bold">Diurna</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Descripción del Cargo</h3>
                      <p className="text-sm text-slate-600 leading-relaxed">
                        Se requiere docente para el programa de {vacancy.program} con experiencia en áreas de tecnología e innovación. 
                        El candidato ideal debe poseer habilidades pedagógicas avanzadas y capacidad para liderar proyectos de investigación formativa.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'requirements' && (
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Perfil Requerido</h3>
                    <ul className="space-y-4">
                      {[
                        'Título profesional en áreas afines al programa.',
                        'Especialización o Maestría en educación o área técnica.',
                        'Mínimo 2 años de experiencia docente universitaria.',
                        'Conocimiento en herramientas de aprendizaje virtual (LMS).',
                        'Certificación de nivel de inglés B2 (Deseable).'
                      ].map((req, i) => (
                        <li key={i} className="flex items-start gap-3">
                          <div className="mt-1 w-5 h-5 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                            <CheckCircleIcon className="h-3.5 w-3.5 text-violet-500" />
                          </div>
                          <span className="text-sm text-slate-600">{req}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {activeTab === 'observations' && (
                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">Notas Internas</h3>
                      <button 
                        onClick={handleAddObservation}
                        className="text-xs font-bold text-violet-600 hover:underline flex items-center gap-1"
                      >
                        <PlusIcon className="h-3.5 w-3.5" />
                        <span>Añadir Nota</span>
                      </button>
                    </div>
                    <div className="space-y-4">
                      {observations.map((obs, i) => (
                        <div key={i} className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs font-bold text-slate-900">{obs.user}</span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{obs.date}</span>
                          </div>
                          <p className="text-sm text-slate-600">{obs.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'tracking' && (
                  <div className="space-y-6">
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2">Línea de Tiempo</h3>
                    <div className="space-y-8 relative ml-4">
                      <div className="absolute left-[-17px] top-2 bottom-2 w-[1px] bg-slate-200"></div>
                      {[
                        { title: 'Vacante Creada', date: '2024-03-20 09:00', user: 'Ricardo Silva', icon: PlusIcon },
                        { title: 'Publicación en Portal', date: '2024-03-20 14:30', user: 'Sistema', icon: DocumentTextIcon },
                        { title: 'Cambio de Estado: En Proceso', date: '2024-03-21 10:15', user: 'Juan Pérez', icon: ArrowPathIcon },
                        { title: 'Observación Agregada', date: '2024-03-22 11:00', user: 'Marta Lucía', icon: ChatBubbleLeftEllipsisIcon },
                      ].map((step, i) => (
                        <div key={i} className="relative flex gap-4">
                          <div className="w-8 h-8 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center z-10 shrink-0">
                            <step.icon className="h-3.5 w-3.5 text-violet-500" />
                          </div>
                          <div>
                            <h4 className="text-sm font-bold text-slate-900">{step.title}</h4>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                              <span>{step.date}</span>
                              <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                              <span className="text-violet-500">{step.user}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-8">
          <div className="glass-panel p-6">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest mb-6">Resumen Operativo</h3>
            <div className="space-y-4">
              <div className="p-4 bg-violet-50/50 rounded-2xl border border-violet-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-violet-600 shadow-sm">
                  <UserIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Postulados</p>
                  <p className="text-lg font-bold text-slate-900">12 Candidatos</p>
                </div>
              </div>
              <div className="p-4 bg-cyan-50/50 rounded-2xl border border-cyan-100 flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-cyan-600 shadow-sm">
                  <ClockIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tiempo Abierta</p>
                  <p className="text-lg font-bold text-slate-900">6 Días</p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-panel p-6 bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white border-none relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
            <h3 className="text-sm font-bold mb-6 uppercase tracking-widest text-white drop-shadow-sm relative z-10">Acciones Rápidas</h3>
            <div className="space-y-3 relative z-10">
              <button 
                onClick={handleAddObservation}
                className="w-full py-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/10 transition-all text-[10px] sm:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 text-white drop-shadow-sm"
              >
                <PlusIcon className="h-4 w-4" />
                <span>Agregar Observación</span>
              </button>
              <button 
                onClick={handleScheduleInterview}
                className="w-full py-3 rounded-xl bg-white/15 hover:bg-white/25 border border-white/10 transition-all text-[10px] sm:text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 text-white drop-shadow-sm"
              >
                <CalendarIcon className="h-4 w-4" />
                <span>Agendar Entrevista</span>
              </button>
              <button 
                onClick={handleCancelVacancy}
                className="w-full py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/20 transition-all text-[10px] sm:text-xs font-bold uppercase tracking-widest text-rose-100 flex items-center justify-center gap-2"
              >
                <ExclamationCircleIcon className="h-4 w-4" />
                <span>Cancelar Vacante</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
