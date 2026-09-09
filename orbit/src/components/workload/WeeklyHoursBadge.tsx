import React from "react";
import { cn } from "@/src/lib/utils";

/** Chip visible de jornada semanal (evita que se pierda en meta secundaria). */
export const WeeklyHoursBadge: React.FC<{
  hours: number | null | undefined;
  workSchedule?: string | null;
  className?: string;
  size?: "sm" | "md";
}> = ({ hours, workSchedule, className, size = "sm" }) => {
  const hasHours = hours != null && Number.isFinite(hours);
  const schedule = workSchedule?.trim() || "";

  if (!hasHours && !schedule) {
    return (
      <span
        className={cn(
          "inline-flex items-center rounded-md border border-orbit-border bg-orbit-interactive px-2 py-0.5 font-semibold text-orbit-muted",
          size === "sm" ? "text-[11px]" : "text-xs",
          className
        )}
        title="Sin jornada semanal registrada"
      >
        Sin jornada
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-sky-200 dark:border-sky-500/28 bg-sky-50 dark:bg-sky-500/12 font-bold text-sky-900 dark:text-sky-100 tabular-nums",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        className
      )}
      title={
        hasHours
          ? `Jornada semanal: ${hours} horas`
          : `Jornada: ${schedule}`
      }
    >
      <span className="uppercase tracking-wide text-sky-700/80 dark:text-sky-300/80 font-semibold text-[9px]">
        Semanal
      </span>
      {hasHours ? (
        <span>
          {hours}
          <span className="font-semibold text-sky-800/80 dark:text-sky-200/80"> h</span>
        </span>
      ) : (
        <span className="max-w-[9rem] truncate font-semibold">{schedule}</span>
      )}
    </span>
  );
};
