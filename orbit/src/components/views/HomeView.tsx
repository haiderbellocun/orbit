import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  UsersIcon, 
  BriefcaseIcon, 
  BellIcon, 
  PlusIcon, 
  ChevronRightIcon, 
  ChartBarIcon, 
  ClockIcon, 
  UserPlusIcon
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { View } from '@/src/types';
import {
  getDashboardSummary,
  type DashboardSummaryResponse,
} from '@/src/lib/api';

interface HomeViewProps {
  setView: (v: View) => void;
  /** Usuario LITE: mensaje acotado en acciones rápidas. */
  isLiteUser?: boolean;
  canBulkImport?: boolean;
  canManageVacancies?: boolean;
}

export const HomeView: React.FC<HomeViewProps> = ({
  setView,
  isLiteUser,
  canBulkImport = true,
  canManageVacancies = true,
}) => {
  type StatCard = {
    label: string;
    value: string;
    trend: string;
    isUp: boolean;
    icon: typeof UsersIcon;
    color: string;
    bg: string;
    detail: string;
  };

  const numberFormatter = new Intl.NumberFormat('es-CO');
  const oneDecimalFormatter = new Intl.NumberFormat('es-CO', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

  const toTrendText = (
    trend: number,
    trendType: DashboardSummaryResponse['activeTeachers']['trendType'],
    withPercentage: boolean
  ): string => {
    const absValue = Math.abs(trend);
    const baseValue = withPercentage
      ? `${oneDecimalFormatter.format(absValue)}%`
      : numberFormatter.format(absValue);

    if (trendType === 'flat') return withPercentage ? `0.0%` : '0';
    const sign = trendType === 'down' || trend < 0 ? '-' : '+';
    return `${sign}${baseValue}`;
  };

  const buildFallbackStats = (): StatCard[] => [
    {
      label: 'Personal Activo',
      value: '0',
      trend: '0.0%',
      isUp: true,
      icon: UsersIcon,
      color: 'text-blue-600',
      bg: 'bg-blue-50/50',
      detail: 'Sin datos disponibles',
    },
    {
      label: 'Vacantes Abiertas',
      value: '0',
      trend: '0.0%',
      isUp: true,
      icon: BriefcaseIcon,
      color: 'text-violet-600',
      bg: 'bg-violet-50/50',
      detail: 'Métrica temporalmente en 0',
    },
    {
      label: 'Novedades Hoy',
      value: '0',
      trend: '0',
      isUp: true,
      icon: BellIcon,
      color: 'text-amber-600',
      bg: 'bg-amber-50/50',
      detail: 'Métrica temporalmente en 0',
    },
  ];

  const [stats, setStats] = useState<StatCard[]>(() => buildFallbackStats());

  useEffect(() => {
    let isMounted = true;

    const loadDashboardSummary = async () => {
      try {
        const summary = await getDashboardSummary();
        if (!isMounted) return;

        const nextStats: StatCard[] = [
          {
            label: 'Personal Activo',
            value: numberFormatter.format(summary.activeTeachers.value),
            trend: toTrendText(
              summary.activeTeachers.trend,
              summary.activeTeachers.trendType,
              true
            ),
            isUp: summary.activeTeachers.trendType !== 'down',
            icon: UsersIcon,
            color: 'text-blue-600',
            bg: 'bg-blue-50/50',
            detail: summary.activeTeachers.detail,
          },
          {
            label: 'Vacantes Abiertas',
            value: numberFormatter.format(summary.openVacancies.value),
            trend: toTrendText(
              summary.openVacancies.trend,
              summary.openVacancies.trendType,
              true
            ),
            isUp: summary.openVacancies.trendType !== 'down',
            icon: BriefcaseIcon,
            color: 'text-violet-600',
            bg: 'bg-violet-50/50',
            detail: summary.openVacancies.detail,
          },
          {
            label: 'Novedades Hoy',
            value: numberFormatter.format(summary.todayNews.value),
            trend: toTrendText(
              summary.todayNews.trend,
              summary.todayNews.trendType,
              false
            ),
            isUp: summary.todayNews.trendType !== 'down',
            icon: BellIcon,
            color: 'text-amber-600',
            bg: 'bg-amber-50/50',
            detail: summary.todayNews.detail,
          },
        ];

        setStats(nextStats);
      } catch (error) {
        console.error('Error loading dashboard summary:', error);
        if (isMounted) {
          setStats(buildFallbackStats());
        }
      }
    };

    loadDashboardSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <div className="space-y-10">
      <Header title="Command Center" subtitle="Resumen operativo de la jornada" />
      
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 grid grid-cols-1 sm:grid-cols-3 gap-6">
          {stats.map((stat, i) => (
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
            {isLiteUser ? (
              <p className="text-sm font-medium text-white/90 leading-relaxed">
                Consulta a tus docentes desde el menú lateral «Docentes». Las demás funciones no están disponibles para tu perfil.
              </p>
            ) : !canBulkImport && !canManageVacancies ? (
              <p className="text-sm font-medium text-white/90 leading-relaxed">
                Usa el menú lateral para acceder a las secciones disponibles para tu perfil.
              </p>
            ) : (
              [
                ...(canBulkImport
                  ? [
                      {
                        label: 'Cargue Masivo de Docentes',
                        icon: UserPlusIcon,
                        action: () => setView('teachers'),
                      },
                    ]
                  : []),
                ...(canManageVacancies
                  ? [
                      {
                        label: 'Nueva Vacante',
                        icon: PlusIcon,
                        action: () => setView('vacancies'),
                      },
                    ]
                  : []),
              ].map((btn, i) => (
                <motion.button
                  key={btn.label}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ delay: 0.3 + i * 0.1 }}
                  onClick={btn.action}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/10 transition-all group backdrop-blur-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white/20 rounded-xl shadow-inner">
                      <btn.icon className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-sm font-bold tracking-wide text-white drop-shadow-sm">
                      {btn.label}
                    </span>
                  </div>
                  <ChevronRightIcon className="h-[18px] w-[18px] text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </motion.button>
              ))
            )}
          </div>
        </div>

        <div className="md:col-span-7 glass-panel p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-xl font-bold text-slate-900 font-display">
              Actividad Reciente
            </h3>

            <button
              disabled
              className="glass-button-secondary py-2 px-4 text-xs font-bold uppercase tracking-widest text-slate-400 cursor-not-allowed opacity-60"
            >
              Ver Auditoría
            </button>
          </div>

          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 }}
              className="flex gap-6 relative"
            >
              <div className="w-7 h-7 rounded-xl shrink-0 flex items-center justify-center z-10 shadow-sm border border-white/50 bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white">
                <ClockIcon className="h-3.5 w-3.5" />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-slate-900 tracking-tight">
                    Próximamente
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    En implementación
                  </span>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed">
                  El historial de actividad reciente estará disponible proximamente.
                </p>

                <div className="flex items-center gap-2 mt-2">
                  <span className="w-4 h-[1px] bg-slate-200"></span>
                  <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest">
                    Módulo en desarrollo
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>

        <div className="md:col-span-5 glass-panel p-8 flex flex-col">
          <h3 className="text-xl font-bold text-slate-900 mb-8 font-display">
            Estado por Sede
          </h3>

          <div className="flex-1 space-y-8">
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-800 tracking-tight">
                  Próximamente
                </span>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  En implementación
                </span>
              </div>

              <div className="h-3 w-full bg-slate-100/50 rounded-full overflow-hidden p-0.5 border border-white/50 shadow-inner">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '35%' }}
                  transition={{ duration: 1.5, ease: 'easeOut', delay: 0.5 }}
                  className="h-full rounded-full bg-gradient-to-r from-slate-200 to-slate-300 shadow-sm"
                />
              </div>
            </div>

            <div className="space-y-3 opacity-70">
              <div className="flex justify-between items-center">
                <span className="text-sm font-bold text-slate-400 tracking-tight">
                  Información por sede
                </span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">
                  Pendiente
                </span>
              </div>

              <div className="h-3 w-full bg-slate-100/50 rounded-full overflow-hidden p-0.5 border border-white/50 shadow-inner">
                <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-slate-100 to-slate-200 shadow-sm" />
              </div>
            </div>
          </div>

          <div className="mt-10 p-5 glass-card bg-violet-50/30 border-violet-100/50">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-white rounded-xl shadow-sm border border-white/50">
                <ChartBarIcon className="h-5 w-5 text-violet-600" />
              </div>

              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                El estado operativo por sede estará disponible próximamente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
