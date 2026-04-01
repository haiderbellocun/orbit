import React from 'react';
import { motion } from 'motion/react';
import { 
  UsersIcon, 
  BriefcaseIcon, 
  BellIcon, 
  PlusIcon, 
  ChevronRightIcon, 
  ChartBarIcon, 
  ClockIcon, 
  ArrowDownTrayIcon, 
  ExclamationCircleIcon,
  UserPlusIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { View } from '@/src/types';

interface HomeViewProps {
  setView: (v: View) => void;
}

export const HomeView: React.FC<HomeViewProps> = ({ setView }) => {
  return (
    <div className="space-y-10">
      <Header title="Command Center" subtitle="Resumen operativo de la jornada" />
      
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {[
            { 
              label: 'Docentes Activos', 
              value: '1,240', 
              trend: '+12.5%', 
              isUp: true, 
              icon: UsersIcon, 
              color: 'text-blue-600', 
              bg: 'bg-blue-50/50',
              detail: '85% de la capacidad total'
            },
            { 
              label: 'Vacantes Abiertas', 
              value: '42', 
              trend: '-4.2%', 
              isUp: false, 
              icon: BriefcaseIcon, 
              color: 'text-violet-600', 
              bg: 'bg-violet-50/50',
              detail: 'Promedio 12 días p/cierre'
            },
            { 
              label: 'Novedades Hoy', 
              value: '18', 
              trend: '+2', 
              isUp: true, 
              icon: BellIcon, 
              color: 'text-amber-600', 
              bg: 'bg-amber-50/50',
              detail: '7 críticas requieren atención'
            },
          ].map((stat, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-card p-8 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-slate-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/2"></div>
              
              <div className="flex justify-between items-start mb-6">
                <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner border border-white/50", stat.bg, stat.color)}>
                  <stat.icon className="h-7 w-7" />
                </div>
                <div className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-white/50 shadow-sm",
                  stat.isUp ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                )}>
                  {stat.isUp ? <ChevronRightIcon className="h-3 w-3 -rotate-90" /> : <ChevronRightIcon className="h-3 w-3 rotate-90" />}
                  {stat.trend}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{stat.label}</p>
                <h3 className="text-4xl font-bold text-slate-900 font-display tracking-tight">{stat.value}</h3>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100/50 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-medium">{stat.detail}</span>
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map(dot => (
                    <div key={dot} className={cn("w-1 h-1 rounded-full", dot <= 3 ? "bg-violet-400" : "bg-slate-200")}></div>
                  ))}
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="md:col-span-4 glass-panel p-8 bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white border-none relative overflow-hidden group shadow-xl shadow-violet-900/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
          <h3 className="text-xl font-bold mb-6 relative z-10 font-display text-white drop-shadow-sm">Acciones Rápidas</h3>
          <div className="space-y-4 relative z-10">
            {[
              { label: 'Registrar Docente', icon: UserPlusIcon, action: () => setView('teachers') },
              { label: 'Nueva Vacante', icon: PlusIcon, action: () => setView('vacancies') },
              { label: 'Reportar Novedad', icon: ExclamationCircleIcon, action: () => setView('news') },
              { label: 'Generar Reporte', icon: ArrowDownTrayIcon, action: () => setView('export') },
            ].map((btn, i) => (
              <motion.button 
                key={i}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                whileHover={{ scale: 1.02, x: 5 }}
                whileTap={{ scale: 0.98 }}
                transition={{ delay: 0.3 + (i * 0.1) }}
                onClick={btn.action}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/10 transition-all group backdrop-blur-md"
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-white/20 rounded-xl shadow-inner">
                    <btn.icon className="h-5 w-5 text-white" />
                  </div>
                  <span className="text-sm font-bold tracking-wide text-white drop-shadow-sm">{btn.label}</span>
                </div>
                <ChevronRightIcon className="h-[18px] w-[18px] text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
              </motion.button>
            ))}
          </div>
        </div>

        <div className="md:col-span-7 glass-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-900 font-display">Actividad Reciente</h3>
            <button onClick={() => setView('audit')} className="glass-button-secondary py-2 px-4 text-xs font-bold uppercase tracking-widest text-violet-600">Ver Auditoría</button>
          </div>
          <div className="space-y-8">
            {[
              { action: 'Actualización de Perfil', date: '2024-03-25 10:30', details: 'Se modificó el estado de Carlos Poveda a "En Licencia"', user: 'Admin User' },
              { action: 'Creación de Vacante', date: '2024-03-25 09:15', details: 'Nueva vacante para Ingeniería de Sistemas', user: 'Admin User' },
              { action: 'Registro de Novedad', date: '2024-03-24 16:45', details: 'Reporte de incapacidad médica - Elena Rodríguez', user: 'Coordinador Norte' },
            ].map((event, i) => (
              <motion.div 
                key={i} 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + (i * 0.1) }}
                className="flex gap-6 relative"
              >
                {i !== 2 && <div className="absolute left-[13px] top-10 bottom-0 w-[1px] bg-slate-100"></div>}
                <div className={cn(
                  "w-7 h-7 rounded-xl shrink-0 flex items-center justify-center z-10 shadow-sm border border-white/50",
                  i === 0 ? "bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white" : "bg-white text-slate-400"
                )}>
                  <ClockIcon className="h-3.5 w-3.5" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-slate-900 tracking-tight">{event.action}</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{event.date}</span>
                  </div>
                  <p className="text-sm text-slate-500 leading-relaxed">{event.details}</p>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="w-4 h-[1px] bg-slate-200"></span>
                    <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">{event.user}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div className="md:col-span-5 glass-panel p-8 flex flex-col">
          <h3 className="text-xl font-bold text-slate-900 mb-8 font-display">Estado por Sede</h3>
          <div className="flex-1 space-y-8">
            {[
              { name: 'Sede Norte', progress: 85, color: 'from-violet-500 to-fuchsia-500', label: 'Operación Óptima' },
              { name: 'Sede Centro', progress: 62, color: 'from-blue-500 to-cyan-500', label: 'Carga Media' },
              { name: 'Sede Sur', progress: 94, color: 'from-emerald-500 to-teal-500', label: 'Operación Óptima' },
            ].map((sede, i) => (
              <div key={i} className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-slate-800 tracking-tight">{sede.name}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{sede.label}</span>
                </div>
                <div className="h-3 w-full bg-slate-100/50 rounded-full overflow-hidden p-0.5 border border-white/50 shadow-inner">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${sede.progress}%` }}
                    transition={{ duration: 1.5, ease: "easeOut", delay: 0.5 }}
                    className={cn("h-full rounded-full bg-gradient-to-r shadow-sm", sede.color)}
                  ></motion.div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-10 p-5 glass-card bg-violet-50/30 border-violet-100/50">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-white rounded-xl shadow-sm border border-white/50">
                <ChartBarIcon className="h-5 w-5 text-violet-600" />
              </div>
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                El sistema ha procesado <span className="text-violet-600 font-bold">142</span> transacciones hoy sin errores.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
