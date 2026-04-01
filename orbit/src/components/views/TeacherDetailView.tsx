import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  RectangleGroupIcon, 
  UserCircleIcon, 
  EnvelopeIcon, 
  PhoneIcon, 
  CalendarIcon, 
  DocumentTextIcon, 
  ArrowPathIcon, 
  ExclamationCircleIcon, 
  BriefcaseIcon, 
  ChevronRightIcon,
  EllipsisHorizontalIcon,
  ClockIcon,
  XMarkIcon,
  CheckIcon
} from '@heroicons/react/24/solid';
import { Teacher, View, Coordinator, Vacancy } from '@/src/types';
import { Header } from '@/src/components/layout/Header';

interface TeacherDetailViewProps {
  teacher: Teacher;
  setView: (v: View) => void;
  searchQuery?: string;
  setSearchQuery?: (q: string) => void;
  searchResults?: {
    teachers: Teacher[];
    vacancies: Vacancy[];
    coordinators: Coordinator[];
  } | null;
}

export const TeacherDetailView: React.FC<TeacherDetailViewProps> = ({ 
  teacher: initialTeacher, 
  setView,
  searchQuery,
  setSearchQuery,
  searchResults
}) => {
  const [teacher, setTeacher] = useState(initialTeacher);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState(initialTeacher);

  const handleSave = () => {
    setTeacher(editForm);
    setIsEditing(false);
  };

  return (
    <div className="space-y-10">
      <Header 
        title="Ficha del Docente" 
        subtitle="Información detallada y gestión" 
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchResults={searchResults}
      />

      <button 
        onClick={() => setView('teachers')}
        className="flex items-center gap-3 text-slate-500 font-bold hover:text-violet-600 transition-all group"
      >
        <div className="p-2 glass-card bg-white/50 group-hover:bg-violet-50 group-hover:border-violet-200 transition-all">
          <ChevronRightIcon className="h-4.5 w-4.5 rotate-180" />
        </div>
        <span className="text-xs uppercase tracking-widest">Volver a Docentes</span>
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Profile Header Card */}
        <div className="lg:col-span-12 glass-panel p-10 bg-white border-white/50 overflow-hidden relative group shadow-2xl shadow-slate-200/50">
          {/* Subtle pattern background */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#8B5CF6 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
          
          {/* "Sparkles" / Gradient Blobs */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-violet-500/10 rounded-full blur-[100px] -translate-y-1/2 translate-x-1/2 group-hover:scale-125 transition-transform duration-1000"></div>
          <div className="absolute bottom-0 left-0 w-64 h-64 bg-fuchsia-500/5 rounded-full blur-[80px] translate-y-1/2 -translate-x-1/2"></div>
          <div className="absolute top-1/2 left-1/3 w-32 h-32 bg-cyan-400/10 rounded-full blur-[60px] animate-pulse"></div>
          
          <div className="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div className="w-40 h-40 rounded-[40px] bg-white shadow-xl flex items-center justify-center text-violet-600 border border-slate-100 relative overflow-hidden group/avatar">
              <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-fuchsia-500/5 opacity-0 group-hover/avatar:opacity-100 transition-opacity" />
              <UserCircleIcon className="h-24 w-24 relative z-10" />
            </div>
            <div className="text-center md:text-left flex-1 space-y-4">
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                <h1 className="text-5xl font-bold tracking-tight font-display text-slate-900">{teacher.name}</h1>
                <span className="px-4 py-1.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full uppercase tracking-widest shadow-lg shadow-emerald-500/20">Activo</span>
              </div>
              <p className="text-violet-600 text-xl font-semibold tracking-wide">{teacher.program} <span className="mx-2 text-slate-200">•</span> {teacher.campus}</p>
              <div className="flex flex-wrap justify-center md:justify-start gap-8 pt-2">
                <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                  <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                    <EnvelopeIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <span>{teacher.email}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                  <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                    <PhoneIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <span>{teacher.phone}</span>
                </div>
                <div className="flex items-center gap-3 text-slate-500 text-sm font-medium">
                  <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                    <CalendarIcon className="h-4 w-4 text-violet-600" />
                  </div>
                  <span>Ingreso: {teacher.joinDate}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-4">
              <button 
                onClick={() => setIsEditing(true)}
                className="glass-button-primary px-8 py-4 shadow-xl shadow-violet-500/20 hover:scale-105 active:scale-95"
              >
                Editar Perfil
              </button>
              <button className="glass-button-secondary p-4 hover:bg-slate-50 transition-all"><EllipsisHorizontalIcon className="h-6 w-6" /></button>
            </div>
          </div>
        </div>

        {/* Details Grid */}
        <div className="lg:col-span-8 space-y-10">
          {/* History / Timeline */}
          <div className="glass-panel p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-10 flex items-center gap-4 font-display">
              <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                <ClockIcon className="h-6 w-6 text-violet-600" />
              </div>
              Historial Operativo
            </h3>
            <div className="space-y-10 ml-4">
              {[
                { date: '25 Mar 2024', title: 'Actualización de Asignación', desc: 'Se asignaron 12 horas adicionales para el periodo 2024-1.', type: 'academic' },
                { date: '10 Feb 2024', title: 'Renovación de Contrato', desc: 'Contrato renovado bajo modalidad de Tiempo Completo.', type: 'contract' },
                { date: '15 Nov 2023', title: 'Registro de Novedad', desc: 'Incapacidad médica por 3 días procesada.', type: 'news' },
              ].map((item, i) => (
                <div key={i} className="flex gap-8 relative">
                  {i !== 2 && <div className="absolute left-[15px] top-10 bottom-0 w-[1px] bg-slate-100"></div>}
                  <div className="w-8 h-8 rounded-xl bg-white shadow-sm border border-slate-100 flex items-center justify-center z-10 shrink-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-gradient-to-tr from-violet-500 to-fuchsia-500"></div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{item.date}</p>
                    <h4 className="text-lg font-bold text-slate-900 tracking-tight">{item.title}</h4>
                    <p className="text-sm text-slate-500 leading-relaxed max-w-lg">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Academic Assignments */}
          <div className="glass-panel p-8">
            <h3 className="text-2xl font-bold text-slate-900 mb-10 flex items-center gap-4 font-display">
              <div className="p-2 bg-violet-50 rounded-xl border border-violet-100">
                <RectangleGroupIcon className="h-6 w-6 text-violet-600" />
              </div>
              Asignaciones Académicas
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                { subject: 'Inteligencia Artificial I', hours: 4, group: 'A1', days: 'Lun, Mie' },
                { subject: 'Estructuras de Datos', hours: 4, group: 'B2', days: 'Mar, Jue' },
                { subject: 'Proyecto de Grado', hours: 2, group: 'P1', days: 'Vie' },
                { subject: 'Investigación Aplicada', hours: 6, group: 'INV', days: 'Remoto' },
              ].map((item, i) => (
                <div key={i} className="glass-card p-6 bg-white/40 border-white/60 group hover:border-violet-200 transition-all">
                  <div className="flex justify-between items-start mb-4">
                    <h4 className="font-bold text-slate-900 group-hover:text-violet-600 transition-colors">{item.subject}</h4>
                    <span className="px-3 py-1 bg-white border border-white/80 text-[10px] font-bold rounded-xl shadow-sm uppercase tracking-widest">{item.group}</span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                    <div className="flex items-center gap-2">
                      <CalendarIcon className="h-3.5 w-3.5 text-violet-400" />
                      <span>{item.hours}h / semana</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ClockIcon className="h-3.5 w-3.5 text-violet-400" />
                      <span>{item.days}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Contextual */}
        <div className="lg:col-span-4 space-y-8">
          <div className="glass-panel p-8">
            <h3 className="text-lg font-bold text-slate-900 mb-8 font-display">Información de Contrato</h3>
            <div className="space-y-6">
              {[
                { label: 'Tipo', value: 'Tiempo Completo' },
                { label: 'Escalafón', value: 'Asociado II' },
                { label: 'Vencimiento', value: '31 Dic 2024' },
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center py-3 border-b border-white/40">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{row.label}</span>
                  <span className="text-sm font-bold text-slate-900">{row.value}</span>
                </div>
              ))}
            </div>
            <button className="glass-button-secondary w-full mt-10 py-4 text-xs font-bold uppercase tracking-widest">
              <DocumentTextIcon className="h-4.5 w-4.5" />
              <span>Descargar Contrato</span>
            </button>
          </div>

          <div className="glass-panel p-8 bg-gradient-to-br from-violet-50/50 to-fuchsia-50/50 border-violet-100/50">
            <h3 className="text-lg font-bold text-slate-900 mb-8 font-display">Acciones de Gestión</h3>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Reintegro', icon: ArrowPathIcon },
                { label: 'Novedad', icon: ExclamationCircleIcon },
                { label: 'Vacante', icon: BriefcaseIcon },
                { label: 'Auditar', icon: ClockIcon },
              ].map((action, i) => (
                <button key={i} className="flex flex-col items-center gap-3 p-5 glass-card bg-white/60 border-white hover:border-violet-300 hover:shadow-violet-200/30 transition-all group">
                  <action.icon className="h-6 w-6 text-slate-400 group-hover:text-violet-600 group-hover:rotate-12 transition-all duration-300" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest group-hover:text-violet-600">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {isEditing && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditing(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="w-full max-w-xl glass-panel p-8 relative z-10 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500"></div>
              
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold text-slate-900 font-display">Editar Perfil</h2>
                <button 
                  onClick={() => setIsEditing(false)}
                  className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                >
                  <XMarkIcon className="h-5 w-5" />
                </button>
              </div>

              <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); handleSave(); }}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Nombre Completo</label>
                    <input 
                      type="text" 
                      className="glass-input w-full"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Correo Electrónico</label>
                    <input 
                      type="email" 
                      className="glass-input w-full"
                      value={editForm.email}
                      onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Teléfono</label>
                    <input 
                      type="text" 
                      className="glass-input w-full"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Programa</label>
                    <input 
                      type="text" 
                      className="glass-input w-full"
                      value={editForm.program}
                      onChange={(e) => setEditForm({ ...editForm, program: e.target.value })}
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-4 pt-6">
                  <button 
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="glass-button-secondary px-8 py-3 text-xs font-bold uppercase tracking-widest"
                  >
                    Cancelar
                  </button>
                  <button 
                    type="submit"
                    className="glass-button-primary px-8 py-3 text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                  >
                    <CheckIcon className="h-4 w-4" />
                    <span>Guardar Cambios</span>
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
