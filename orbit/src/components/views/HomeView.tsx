import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  UsersIcon,
  BriefcaseIcon,
  BellIcon,
  PlusIcon,
  ChevronRightIcon,
  CheckBadgeIcon,
  ClockIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/solid';
import { Header } from '@/src/components/layout/Header';
import { cn } from '@/src/lib/utils';
import { View } from '@/src/types';
import {
  getDashboardSummary,
  type DashboardSummaryMetric,
  type DashboardSummaryResponse,
} from '@/src/lib/api';
import { useTutorialOptional } from '@/src/components/tutorial/TutorialContext';

interface HomeViewProps {
  setView: (v: View) => void;
  /** Usuario LITE: mensaje acotado en acciones rápidas. */
  isLiteUser?: boolean;
  canManageVacancies?: boolean;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

type MetricKey =
  | 'activeTeachers'
  | 'openVacancies'
  | 'monthlyHires'
  | 'timeToHire'
  | 'agingVacancies'
  | 'todayNews';

type CardConfig = {
  key: MetricKey;
  label: string;
  icon: typeof UsersIcon;
  color: string;
  bg: string;
  valueSuffix?: string;
  /** Solo visible para perfiles con acceso a vacantes. */
  requiresVacancies?: boolean;
  emptyDetail: string;
};

const CARD_CONFIG: readonly CardConfig[] = [
  {
    key: 'activeTeachers',
    label: 'Personal Activo',
    icon: UsersIcon,
    color: 'text-blue-600',
    bg: 'bg-blue-50/50',
    emptyDetail: 'Sin datos disponibles',
  },
  {
    key: 'openVacancies',
    label: 'Vacantes Abiertas',
    icon: BriefcaseIcon,
    color: 'text-violet-600',
    bg: 'bg-violet-50/50',
    requiresVacancies: true,
    emptyDetail: 'Sin vacantes en proceso',
  },
  {
    key: 'monthlyHires',
    label: 'Contrataciones del Mes',
    icon: CheckBadgeIcon,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50/50',
    requiresVacancies: true,
    emptyDetail: 'Sin contrataciones este mes',
  },
  {
    key: 'timeToHire',
    label: 'Tiempo de Cierre',
    icon: ClockIcon,
    color: 'text-cyan-600',
    bg: 'bg-cyan-50/50',
    valueSuffix: ' d',
    requiresVacancies: true,
    emptyDetail: 'Sin cierres recientes',
  },
  {
    key: 'agingVacancies',
    label: 'Vacantes en Riesgo',
    icon: ExclamationTriangleIcon,
    color: 'text-rose-600',
    bg: 'bg-rose-50/50',
    requiresVacancies: true,
    emptyDetail: 'Ninguna supera los 30 días',
  },
  {
    key: 'todayNews',
    label: 'Novedades Hoy',
    icon: BellIcon,
    color: 'text-amber-600',
    bg: 'bg-amber-50/50',
    emptyDetail: 'Sin novedades hoy',
  },
];

const numberFormatter = new Intl.NumberFormat('es-CO');
const oneDecimalFormatter = new Intl.NumberFormat('es-CO', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatTrend(metric: DashboardSummaryMetric): string | null {
  if (!metric.trendUnit || metric.trendUnit === 'none' || metric.trendType === 'flat') {
    return null;
  }
  const abs = Math.abs(metric.trend);
  const sign = metric.trendType === 'down' ? '-' : '+';
  return metric.trendUnit === 'percent'
    ? `${sign}${oneDecimalFormatter.format(abs)}%`
    : `${sign}${numberFormatter.format(abs)}`;
}

export const HomeView: React.FC<HomeViewProps> = ({
  setView,
  isLiteUser,
  canManageVacancies = true,
  onOpenVacancyFromNotification,
}) => {
  const tutorial = useTutorialOptional();
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ok' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const loadDashboardSummary = async () => {
      setLoadState('loading');
      setLoadError(null);
      try {
        const data = await getDashboardSummary();
        if (!isMounted) return;
        setSummary(data);
        setLoadState('ok');
      } catch (error) {
        console.error('Error loading dashboard summary:', error);
        if (!isMounted) return;
        setSummary(null);
        setLoadState('error');
        setLoadError(
          error instanceof Error ? error.message : 'No se pudo cargar el resumen'
        );
      }
    };

    loadDashboardSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  const cards = useMemo(
    () =>
      CARD_CONFIG.filter(
        (card) => !card.requiresVacancies || canManageVacancies
      ).map((card) => {
        const metric = summary?.[card.key] as DashboardSummaryMetric | undefined;
        return {
          ...card,
          value: `${numberFormatter.format(metric?.value ?? 0)}${card.valueSuffix ?? ''}`,
          detail: metric?.detail ?? card.emptyDetail,
          trend: metric ? formatTrend(metric) : null,
          trendGood: metric?.trendGood ?? true,
          trendType: metric?.trendType ?? 'flat',
        };
      }),
    [summary, canManageVacancies]
  );

  return (
    <div className="space-y-10">
      <Header
        title="Command Center"
        subtitle="Resumen operativo de la jornada"
        onOpenVacancyFromNotification={onOpenVacancyFromNotification}
      />

      {loadState === 'error' && loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          No se pudieron cargar las métricas: {loadError}. Cierra sesión y vuelve a entrar.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div
          data-tutorial="home-metrics"
          className={cn(
          "md:col-span-8 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6",
          loadState === 'loading' && "opacity-60"
        )}>
          {cards.map((card, i) => (
            <motion.div
              key={card.key}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="glass-card p-6 group relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-slate-100/50 to-transparent rounded-full -translate-y-1/2 translate-x-1/2"></div>

              <div className="flex justify-between items-start mb-5">
                <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner border border-white/50", card.bg, card.color)}>
                  <card.icon className="h-6 w-6" />
                </div>
                {card.trend && (
                  <div className={cn(
                    "flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border border-white/50 shadow-sm",
                    card.trendGood ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  )}>
                    <ChevronRightIcon className={cn("h-3 w-3", card.trendType === 'down' ? "rotate-90" : "-rotate-90")} />
                    {card.trend}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">{card.label}</p>
                <h3 className="text-3xl font-bold text-slate-900 font-display tracking-tight">{card.value}</h3>
              </div>

              <div className="mt-5 pt-4 border-t border-slate-100/50">
                <span className="text-[10px] text-slate-500 font-medium">{card.detail}</span>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="md:col-span-4 space-y-4">
          <div
            data-tutorial="home-quick-actions"
            className="glass-panel p-8 bg-gradient-to-br from-violet-600 to-fuchsia-700 text-white border-none relative overflow-hidden group shadow-xl shadow-violet-900/20"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 group-hover:scale-150 transition-transform duration-700"></div>
            <h3 className="text-xl font-bold mb-6 relative z-10 font-display text-white drop-shadow-sm">Acciones Rápidas</h3>
            <div className="space-y-4 relative z-10">
              {isLiteUser ? (
                <p className="text-sm font-medium text-white/90 leading-relaxed">
                  Usa el menú lateral para acceder a las secciones disponibles para tu perfil.
                </p>
              ) : !canManageVacancies ? (
                <p className="text-sm font-medium text-white/90 leading-relaxed">
                  Usa el menú lateral para acceder a las secciones disponibles para tu perfil.
                </p>
              ) : (
                <motion.button
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  whileHover={{ scale: 1.02, x: 5 }}
                  whileTap={{ scale: 0.98 }}
                  transition={{ delay: 0.3 }}
                  onClick={() => setView('vacancies')}
                  className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/10 transition-all group backdrop-blur-md"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white/20 rounded-xl shadow-inner">
                      <PlusIcon className="h-5 w-5 text-white" />
                    </div>
                    <span className="text-sm font-bold tracking-wide text-white drop-shadow-sm">
                      Nueva Vacante
                    </span>
                  </div>
                  <ChevronRightIcon className="h-[18px] w-[18px] text-white/50 group-hover:text-white group-hover:translate-x-1 transition-all" />
                </motion.button>
              )}
            </div>
          </div>

          <div
            data-tutorial="home-tutorial-toggle"
            className="glass-panel p-5 flex items-center justify-between gap-4"
          >
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Tutorial de ayuda</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                Si está prendido, el recorrido guiado aparece al entrar a Orbit.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={tutorial?.enabled ?? true}
              aria-label="Prender o apagar tutorial"
              onClick={() => tutorial?.setEnabled(!(tutorial?.enabled ?? true))}
              className={cn(
                'relative shrink-0 w-12 h-7 rounded-full transition-colors border',
                tutorial?.enabled
                  ? 'bg-violet-600 border-violet-500'
                  : 'bg-slate-200 border-slate-300'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
                  tutorial?.enabled && 'translate-x-5'
                )}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
