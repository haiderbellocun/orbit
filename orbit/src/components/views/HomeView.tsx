import React, { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  UsersIcon,
  BriefcaseIcon,
  BellIcon,
  PlusIcon,
  ArrowRightIcon,
  CheckBadgeIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  ChevronRightIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/solid";
import { Header } from "@/src/components/layout/Header";
import { cn } from "@/src/lib/utils";
import { View } from "@/src/types";
import {
  getDashboardSummary,
  getPlantaActiva,
  getStoredCapabilities,
  type DashboardSummaryMetric,
  type DashboardSummaryResponse,
} from "@/src/lib/api";
import {
  hasCapability,
  ORBIT_CAPABILITY,
} from "@/src/lib/permissions";
import { setPlantaPendingFilters } from "@/src/lib/plantaPendingFilters";
import { useTutorialOptional } from "@/src/components/tutorial/TutorialContext";

interface HomeViewProps {
  setView: (v: View) => void;
  isLiteUser?: boolean;
  canManageVacancies?: boolean;
  onOpenVacancyFromNotification?: (vacancyId: string) => void;
}

type MetricKey =
  | "activeTeachers"
  | "openVacancies"
  | "monthlyHires"
  | "timeToHire"
  | "agingVacancies"
  | "todayNews";

type CardConfig = {
  key: MetricKey;
  label: string;
  icon: typeof UsersIcon;
  tone: "info" | "primary" | "success" | "warning" | "danger" | "muted";
  valueSuffix?: string;
  requiresVacancies?: boolean;
  emptyDetail: string;
  targetView: View;
};

const CARD_CONFIG: readonly CardConfig[] = [
  {
    key: "activeTeachers",
    label: "Personal activo",
    icon: UsersIcon,
    tone: "info",
    emptyDetail: "Sin datos disponibles",
    targetView: "planta-activa",
  },
  {
    key: "openVacancies",
    label: "Vacantes abiertas",
    icon: BriefcaseIcon,
    tone: "primary",
    requiresVacancies: true,
    emptyDetail: "Sin vacantes en proceso",
    targetView: "vacancies",
  },
  {
    key: "monthlyHires",
    label: "Contrataciones del mes",
    icon: CheckBadgeIcon,
    tone: "success",
    requiresVacancies: true,
    emptyDetail: "Sin contrataciones este mes",
    targetView: "vacancies",
  },
  {
    key: "timeToHire",
    label: "Tiempo promedio de cierre",
    icon: ClockIcon,
    tone: "muted",
    valueSuffix: " d",
    requiresVacancies: true,
    emptyDetail: "Sin cierres recientes",
    targetView: "vacancies",
  },
  {
    key: "agingVacancies",
    label: "Vacantes en riesgo",
    icon: ExclamationTriangleIcon,
    tone: "danger",
    requiresVacancies: true,
    emptyDetail: "Ninguna supera los 30 días",
    targetView: "vacancies",
  },
  {
    key: "todayNews",
    label: "Novedades del día",
    icon: BellIcon,
    tone: "warning",
    emptyDetail: "Sin novedades hoy",
    targetView: "news",
  },
];

const TONE_ICON: Record<CardConfig["tone"], string> = {
  info: "text-orbit-info bg-orbit-info/10",
  primary: "text-orbit-primary bg-orbit-primary/10",
  success: "text-orbit-success bg-orbit-success/10",
  warning: "text-orbit-warning bg-orbit-warning/10",
  danger: "text-orbit-danger bg-orbit-danger/10",
  muted: "text-orbit-muted bg-orbit-interactive",
};

const numberFormatter = new Intl.NumberFormat("es-CO");
const oneDecimalFormatter = new Intl.NumberFormat("es-CO", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatTrend(metric: DashboardSummaryMetric): string | null {
  if (!metric.trendUnit || metric.trendUnit === "none" || metric.trendType === "flat") {
    return null;
  }
  const abs = Math.abs(metric.trend);
  const sign = metric.trendType === "down" ? "−" : "+";
  return metric.trendUnit === "percent"
    ? `${sign}${oneDecimalFormatter.format(abs)}%`
    : `${sign}${numberFormatter.format(abs)}`;
}

function formatPeriodLabel(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }
  return d.toLocaleDateString("es-CO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

type AttentionItem = {
  id: string;
  title: string;
  detail: string;
  severity: "danger" | "warning" | "info";
  view: View;
  count: number;
};

export const HomeView: React.FC<HomeViewProps> = ({
  setView,
  isLiteUser,
  canManageVacancies = true,
  onOpenVacancyFromNotification: _onOpenVacancyFromNotification,
}) => {
  const tutorial = useTutorialOptional();
  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [missingEduEmailCount, setMissingEduEmailCount] = useState<number | null>(
    null
  );
  const [missingDocumentCount, setMissingDocumentCount] = useState<number | null>(
    null
  );

  const canPlanta = useMemo(
    () =>
      hasCapability(getStoredCapabilities(), ORBIT_CAPABILITY.PLANTA_ACTIVA),
    []
  );

  useEffect(() => {
    let isMounted = true;

    const loadDashboardSummary = async () => {
      setLoadState("loading");
      setLoadError(null);
      try {
        const data = await getDashboardSummary();
        if (!isMounted) return;
        setSummary(data);
        setLoadState("ok");
      } catch (error) {
        console.error("Error loading dashboard summary:", error);
        if (!isMounted) return;
        setSummary(null);
        setLoadState("error");
        setLoadError(
          error instanceof Error ? error.message : "No se pudo cargar el resumen"
        );
      }
    };

    loadDashboardSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!canPlanta) {
      setMissingEduEmailCount(null);
      setMissingDocumentCount(null);
      return;
    }
    let cancelled = false;
    void Promise.all([
      getPlantaActiva({
        without_edu_email: true,
        status: "active",
        page: 1,
        limit: 1,
      }),
      getPlantaActiva({
        without_document: true,
        status: "active",
        page: 1,
        limit: 1,
      }),
    ])
      .then(([emailRes, docRes]) => {
        if (cancelled) return;
        setMissingEduEmailCount(Number(emailRes.pagination?.total ?? 0));
        setMissingDocumentCount(Number(docRes.pagination?.total ?? 0));
      })
      .catch(() => {
        if (!cancelled) {
          setMissingEduEmailCount(null);
          setMissingDocumentCount(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [canPlanta]);

  const cards = useMemo(
    () =>
      CARD_CONFIG.filter(
        (card) => !card.requiresVacancies || canManageVacancies
      ).map((card) => {
        const metric = summary?.[card.key] as DashboardSummaryMetric | undefined;
        return {
          ...card,
          value: `${numberFormatter.format(metric?.value ?? 0)}${card.valueSuffix ?? ""}`,
          detail: metric?.detail ?? card.emptyDetail,
          trend: metric ? formatTrend(metric) : null,
          trendGood: metric?.trendGood ?? true,
          trendType: metric?.trendType ?? "flat",
          rawValue: metric?.value ?? 0,
        };
      }),
    [summary, canManageVacancies]
  );

  const attentionItems = useMemo((): AttentionItem[] => {
    const items: AttentionItem[] = [];

    if (canPlanta) {
      const emailCount = missingEduEmailCount ?? 0;
      items.push({
        id: "missing-edu-email",
        title: "Personal sin correo institucional",
        detail:
          missingEduEmailCount == null
            ? "Revisar personas activas sin correo CUN"
            : emailCount > 0
              ? `${numberFormatter.format(emailCount)} personas activas sin correo CUN`
              : "No hay personas activas sin correo CUN",
        severity: "danger",
        view: "planta-activa",
        count: emailCount,
      });

      const docCount = missingDocumentCount ?? 0;
      items.push({
        id: "missing-document",
        title: "Personal sin identificación",
        detail:
          missingDocumentCount == null
            ? "Revisar personas activas sin documento"
            : docCount > 0
              ? `${numberFormatter.format(docCount)} personas activas sin identificación`
              : "No hay personas activas sin identificación",
        severity: "danger",
        view: "planta-activa",
        count: docCount,
      });
    }

    if (!summary) return items;

    if (canManageVacancies && summary.agingVacancies.value > 0) {
      items.push({
        id: "aging",
        title: "Vacantes en riesgo",
        detail:
          summary.agingVacancies.detail ||
          `${summary.agingVacancies.value} con más de 30 días abiertas`,
        severity: "danger",
        view: "vacancies",
        count: summary.agingVacancies.value,
      });
    }

    const criticalNews = summary.todayNews.criticalCount ?? 0;
    if (summary.todayNews.value > 0 || criticalNews > 0) {
      items.push({
        id: "news",
        title: criticalNews > 0 ? "Novedades críticas" : "Novedades del día",
        detail:
          criticalNews > 0
            ? `${criticalNews} requieren seguimiento prioritario`
            : summary.todayNews.detail || `${summary.todayNews.value} registradas hoy`,
        severity: criticalNews > 0 ? "warning" : "info",
        view: "news",
        count: criticalNews > 0 ? criticalNews : summary.todayNews.value,
      });
    }

    items.push({
      id: "balance",
      title: "Cargas desequilibradas",
      detail: "Revisar horas sustantivas y preparación de clase",
      severity: "info",
      view: "substantive-hours",
      count: 0,
    });

    return items;
  }, [summary, canManageVacancies, canPlanta, missingEduEmailCount, missingDocumentCount]);

  const openAttentionItem = (item: AttentionItem) => {
    if (item.id === "missing-edu-email") {
      setPlantaPendingFilters({ withoutEduEmail: true });
    } else if (item.id === "missing-document") {
      setPlantaPendingFilters({ withoutDocument: true });
    }
    setView(item.view);
  };

  const periodLabel = formatPeriodLabel(summary?.updatedAt);
  const canQuickCreate = canManageVacancies && !isLiteUser;

  return (
    <div className="space-y-5">
      <Header
        title="Command Center"
        subtitle={`${periodLabel.charAt(0).toUpperCase()}${periodLabel.slice(1)} · Resumen operativo`}
        actions={
          canQuickCreate ? (
            <button
              type="button"
              onClick={() => setView("vacancies")}
              className="glass-button-primary h-9 px-3 text-xs"
            >
              <PlusIcon className="h-4 w-4" />
              Nueva vacante
            </button>
          ) : undefined
        }
      />

      {loadState === "error" && loadError && (
        <div className="rounded-[12px] border border-orbit-danger/40 bg-orbit-danger/10 px-4 py-3 text-sm text-orbit-danger">
          No se pudieron cargar las métricas: {loadError}. Cierra sesión y vuelve a entrar.
        </div>
      )}

      {/* Indicator strip */}
      <div
        data-tutorial="home-metrics"
        className={cn(
          "grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6",
          loadState === "loading" && "opacity-60"
        )}
      >
        {cards.map((card, i) => (
          <motion.button
            key={card.key}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04, duration: 0.18 }}
            onClick={() => setView(card.targetView)}
            className="group flex min-h-[118px] flex-col rounded-[12px] border border-orbit-border bg-orbit-elevated p-3.5 text-left transition-colors duration-150 hover:border-orbit-primary/40 hover:bg-orbit-interactive"
          >
            <div className="mb-3 flex items-start justify-between gap-2">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg",
                  TONE_ICON[card.tone]
                )}
              >
                <card.icon className="h-4 w-4" />
              </span>
              {card.trend && (
                <span
                  className={cn(
                    "rounded-md px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    card.trendGood
                      ? "bg-orbit-success/15 text-orbit-success"
                      : "bg-orbit-danger/15 text-orbit-danger"
                  )}
                >
                  {card.trend}
                </span>
              )}
            </div>
            <p className="orbit-label mb-1 normal-case tracking-wide">{card.label}</p>
            <p className="orbit-metric-value text-[1.5rem]">{card.value}</p>
            <p className="mt-auto pt-2 text-[11px] leading-snug text-orbit-muted line-clamp-2">
              {card.detail}
            </p>
            <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-orbit-primary opacity-0 transition-opacity duration-150 group-hover:opacity-100">
              Abrir
              <ArrowRightIcon className="h-3 w-3" />
            </span>
          </motion.button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Priority work queue */}
        <section className="lg:col-span-8">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="orbit-section-title">Trabajo que requiere atención</h2>
              <p className="text-xs text-orbit-muted">
                Prioridades derivadas del estado operativo actual
              </p>
            </div>
            <span className="orbit-label">{attentionItems.length} ítems</span>
          </div>

          <div className="overflow-hidden rounded-[12px] border border-orbit-border bg-orbit-surface">
            {attentionItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
                <ArrowsRightLeftIcon className="h-8 w-8 text-orbit-muted" />
                <p className="text-sm text-orbit-text-secondary">
                  No hay alertas prioritarias en este momento
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-orbit-border">
                {attentionItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => openAttentionItem(item)}
                      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-150 hover:bg-orbit-interactive"
                    >
                      <span
                        className={cn(
                          "h-2 w-2 shrink-0 rounded-full",
                          item.severity === "danger" && "bg-orbit-danger",
                          item.severity === "warning" && "bg-orbit-warning",
                          item.severity === "info" && "bg-orbit-info"
                        )}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-orbit-text">
                            {item.title}
                          </span>
                          {item.count > 0 && (
                            <span className="rounded-md bg-orbit-interactive px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-orbit-text-secondary">
                              {item.count}
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-orbit-muted">
                          {item.detail}
                        </span>
                      </span>
                      <ChevronRightIcon className="h-4 w-4 shrink-0 text-orbit-muted" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Quick actions + tutorial */}
        <aside className="space-y-3 lg:col-span-4">
          <div
            data-tutorial="home-quick-actions"
            className="rounded-[12px] border border-orbit-border bg-orbit-elevated p-4"
          >
            <h3 className="orbit-section-title mb-3 text-sm">Acciones rápidas</h3>
            <div className="space-y-1.5">
              {canQuickCreate ? (
                <button
                  type="button"
                  onClick={() => setView("vacancies")}
                  className="flex w-full items-center justify-between rounded-[10px] border border-orbit-border bg-orbit-interactive px-3 py-2.5 text-left transition-colors duration-150 hover:border-orbit-primary/40"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orbit-primary/15 text-orbit-primary">
                      <PlusIcon className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-orbit-text">
                      Nueva vacante
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 text-orbit-muted" />
                </button>
              ) : (
                <p className="text-xs leading-relaxed text-orbit-muted">
                  Usa el menú o la búsqueda para acceder a las secciones de tu perfil.
                </p>
              )}

              <button
                type="button"
                onClick={() => setView("planta-activa")}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-sm text-orbit-text-secondary transition-colors duration-150 hover:bg-orbit-interactive hover:text-orbit-text"
              >
                <span className="flex items-center gap-2.5">
                  <UsersIcon className="h-4 w-4 text-orbit-muted" />
                  Ir a Planta Activa
                </span>
                <ChevronRightIcon className="h-4 w-4 text-orbit-muted" />
              </button>

              <button
                type="button"
                onClick={() => setView("news")}
                className="flex w-full items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-sm text-orbit-text-secondary transition-colors duration-150 hover:bg-orbit-interactive hover:text-orbit-text"
              >
                <span className="flex items-center gap-2.5">
                  <BellIcon className="h-4 w-4 text-orbit-muted" />
                  Ir a Novedades
                </span>
                <ChevronRightIcon className="h-4 w-4 text-orbit-muted" />
              </button>
            </div>
          </div>

          <div
            data-tutorial="home-tutorial-toggle"
            className="flex items-center justify-between gap-3 rounded-[12px] border border-orbit-border bg-orbit-surface px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-orbit-text">Tutorial de ayuda</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-orbit-muted">
                Recorrido guiado al entrar a Orbit
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={tutorial?.enabled ?? true}
              aria-label="Prender o apagar tutorial"
              onClick={() => tutorial?.setEnabled(!(tutorial?.enabled ?? true))}
              className={cn(
                "relative h-7 w-11 shrink-0 rounded-full border transition-colors duration-150",
                tutorial?.enabled
                  ? "border-orbit-primary bg-orbit-primary"
                  : "border-orbit-border bg-orbit-interactive"
              )}
            >
              <span
                className={cn(
                  "absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-orbit-elevated shadow transition-transform duration-150",
                  tutorial?.enabled && "translate-x-4"
                )}
              />
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
