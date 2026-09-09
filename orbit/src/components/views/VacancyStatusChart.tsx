import React, { useMemo, useState } from "react";
import { ChartBarIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { cn } from "@/src/lib/utils";
import type { Vacancy, VacancyOperationStatus } from "@/src/types";
import { STATUS_LABEL } from "@/src/lib/vacancyFormHelpers";

const STORAGE_KEY = "orbit_vacancy_status_chart_expanded";

const STATUS_ORDER: VacancyOperationStatus[] = [
  "open",
  "selected",
  "requisition_sent",
  "internal_movement",
  "hired",
  "closed",
  "cancelled",
  "cancelled_by_capital",
];

/** Colores sólidos y contrastados, tanto sobre fondo blanco como oscuro. */
const STATUS_BAR: Record<
  VacancyOperationStatus,
  { bar: string; qty: string; track: string; dot: string }
> = {
  open: {
    bar: "bg-sky-500",
    qty: "bg-sky-200",
    track: "bg-sky-100 dark:bg-sky-500/15",
    dot: "bg-sky-500",
  },
  selected: {
    bar: "bg-amber-500",
    qty: "bg-amber-200",
    track: "bg-amber-100 dark:bg-amber-500/15",
    dot: "bg-amber-500",
  },
  requisition_sent: {
    bar: "bg-violet-600",
    qty: "bg-violet-300",
    track: "bg-violet-100 dark:bg-violet-500/15",
    dot: "bg-violet-600",
  },
  internal_movement: {
    bar: "bg-cyan-600",
    qty: "bg-cyan-200",
    track: "bg-cyan-100 dark:bg-cyan-500/15",
    dot: "bg-cyan-600",
  },
  hired: {
    bar: "bg-emerald-600",
    qty: "bg-emerald-300",
    track: "bg-emerald-100 dark:bg-emerald-500/15",
    dot: "bg-emerald-600",
  },
  closed: {
    bar: "bg-slate-500",
    qty: "bg-slate-300",
    track: "bg-slate-100 dark:bg-slate-500/15",
    dot: "bg-slate-500",
  },
  cancelled: {
    bar: "bg-zinc-500",
    qty: "bg-zinc-300",
    track: "bg-zinc-100 dark:bg-zinc-500/15",
    dot: "bg-zinc-500",
  },
  cancelled_by_capital: {
    bar: "bg-rose-500",
    qty: "bg-rose-200",
    track: "bg-rose-100 dark:bg-rose-500/15",
    dot: "bg-rose-500",
  },
};

const numberFormatter = new Intl.NumberFormat("es-CO");

function readExpandedPreference(): boolean {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "0") return false;
    if (v === "1") return true;
  } catch {
    /* ignore */
  }
  return true;
}

type VacancyStatusChartProps = {
  vacancies: Vacancy[];
  loading?: boolean;
  activeStatus?: VacancyOperationStatus | "";
  onSelectStatus?: (status: VacancyOperationStatus | "") => void;
};

export const VacancyStatusChart: React.FC<VacancyStatusChartProps> = ({
  vacancies,
  loading = false,
  activeStatus = "",
  onSelectStatus,
}) => {
  const [expanded, setExpanded] = useState(readExpandedPreference);

  const toggleExpanded = () => {
    setExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const series = useMemo(() => {
    const map = new Map<
      VacancyOperationStatus,
      { count: number; quantity: number }
    >();
    for (const s of STATUS_ORDER) map.set(s, { count: 0, quantity: 0 });
    for (const v of vacancies) {
      const cur = map.get(v.operationStatus);
      if (!cur) continue;
      cur.count += 1;
      cur.quantity += v.quantity ?? 0;
    }
    return STATUS_ORDER.map((status) => ({
      status,
      label: STATUS_LABEL[status],
      ...(map.get(status) ?? { count: 0, quantity: 0 }),
    }));
  }, [vacancies]);

  const maxValue = Math.max(
    1,
    ...series.flatMap((s) => [s.count, s.quantity])
  );

  const totalCount = series.reduce((n, s) => n + s.count, 0);
  const totalQty = series.reduce((n, s) => n + s.quantity, 0);

  return (
    <section className="glass-card relative z-10 p-5">
      <div
        className={cn(
          "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
          expanded && "mb-4 sm:items-start"
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-violet-200 bg-violet-50 text-violet-600 dark:border-violet-500/28 dark:bg-violet-500/12 dark:text-violet-300">
            <ChartBarIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base font-bold text-orbit-text">
                Vacantes por estado
              </h2>
              {!expanded && !loading && (
                <span className="rounded-md bg-orbit-interactive px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-orbit-text-secondary">
                  {numberFormatter.format(totalCount)} ·{" "}
                  {numberFormatter.format(totalQty)} solic.
                </span>
              )}
            </div>
            {expanded && (
              <p className="mt-0.5 text-[12px] text-orbit-muted">
                Compara volumen por categoría. Pulsa un estado para filtrar la
                tabla.
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 self-end sm:self-auto">
          {expanded && (
            <div className="hidden flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] font-medium text-orbit-text-secondary lg:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-5 rounded-sm bg-violet-600" />
                Vacantes
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-5 rounded-sm border border-violet-400 bg-violet-200"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(-45deg, transparent, transparent 2px, rgba(109,40,217,0.35) 2px, rgba(109,40,217,0.35) 4px)",
                  }}
                />
                Personas solicitadas
              </span>
              <span className="tabular-nums font-semibold text-orbit-text">
                {loading
                  ? "—"
                  : `${numberFormatter.format(totalCount)} · ${numberFormatter.format(totalQty)} solic.`}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={toggleExpanded}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-orbit-border bg-orbit-bg dark:bg-orbit-elevated px-3 text-xs font-semibold text-orbit-text-secondary transition-colors hover:bg-orbit-interactive hover:text-orbit-text"
            aria-expanded={expanded}
            aria-controls="vacancy-status-chart-body"
          >
            {expanded ? "Ocultar" : "Mostrar"}
            <ChevronDownIcon
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                expanded && "rotate-180"
              )}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div id="vacancy-status-chart-body">
          {loading ? (
            <div className="flex h-48 items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
            </div>
          ) : totalCount === 0 ? (
            <p className="py-10 text-center text-sm text-orbit-muted">
              No hay vacantes para graficar con los filtros actuales.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {series.map((row) => {
                const countPct =
                  row.count > 0
                    ? Math.max(6, (row.count / maxValue) * 100)
                    : 0;
                const qtyPct =
                  row.quantity > 0
                    ? Math.max(6, (row.quantity / maxValue) * 100)
                    : 0;
                const colors = STATUS_BAR[row.status];
                const isActive = activeStatus === row.status;
                const hasData = row.count > 0 || row.quantity > 0;
                const disabled = !hasData && !isActive;

                return (
                  <li key={row.status}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() =>
                        onSelectStatus?.(isActive ? "" : row.status)
                      }
                      className={cn(
                        "w-full rounded-[10px] px-3 py-2.5 text-left transition-colors",
                        isActive && "bg-violet-50 dark:bg-violet-500/12 ring-2 ring-violet-400/70",
                        !disabled &&
                          !isActive &&
                          "hover:bg-orbit-bg-secondary dark:hover:bg-orbit-interactive/40",
                        disabled && "cursor-default opacity-45"
                      )}
                      title={
                        disabled
                          ? undefined
                          : isActive
                            ? "Quitar filtro de estado"
                            : `Filtrar por ${row.label}`
                      }
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className={cn(
                              "h-2.5 w-2.5 shrink-0 rounded-full",
                              colors.dot
                            )}
                          />
                          <span className="truncate text-[13px] font-semibold text-orbit-text">
                            {row.label}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] font-semibold tabular-nums text-orbit-text-secondary">
                          <span className="text-orbit-text">
                            {numberFormatter.format(row.count)}
                          </span>{" "}
                          vac.{" "}
                          <span className="text-orbit-muted">·</span>{" "}
                          <span className="text-orbit-text">
                            {numberFormatter.format(row.quantity)}
                          </span>{" "}
                          solic.
                        </span>
                      </div>

                      <div className="space-y-1.5">
                        <div
                          className={cn(
                            "h-3.5 overflow-hidden rounded-md",
                            colors.track
                          )}
                          aria-hidden={!row.count}
                        >
                          {row.count > 0 && (
                            <div
                              className={cn(
                                "h-full rounded-md transition-all duration-300",
                                colors.bar
                              )}
                              style={{ width: `${countPct}%` }}
                            />
                          )}
                        </div>
                        <div
                          className={cn(
                            "h-3 overflow-hidden rounded-md border border-[var(--orbit-hairline)]",
                            colors.track
                          )}
                          aria-hidden={!row.quantity}
                        >
                          {row.quantity > 0 && (
                            <div
                              className={cn(
                                "h-full rounded-md transition-all duration-300",
                                colors.qty
                              )}
                              style={{
                                width: `${qtyPct}%`,
                                backgroundImage:
                                  "repeating-linear-gradient(-45deg, transparent, transparent 3px, rgba(0,0,0,0.12) 3px, rgba(0,0,0,0.12) 5px)",
                              }}
                            />
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
