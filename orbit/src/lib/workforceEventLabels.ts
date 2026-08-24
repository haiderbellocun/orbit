import type { WorkforceEventStatus } from "@/src/lib/api";

/** Orden sugerido en formularios de creación. */
export const WORKFORCE_EVENT_STATUS_OPTIONS: readonly WorkforceEventStatus[] = [
  "NOT_TAKEN",
  "PENDING",
  "APPROVED",
  "TAKEN",
  "REJECTED",
  "CANCELLED",
] as const;

export const WORKFORCE_EVENT_STATUS_LABELS: Record<
  WorkforceEventStatus,
  string
> = {
  PENDING: "Pendiente",
  APPROVED: "Aprobado",
  REJECTED: "Rechazado",
  TAKEN: "Tomado",
  NOT_TAKEN: "No tomado",
  CANCELLED: "Cancelado",
};

export function formatWorkforceEventSchedule(event: {
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
}): string | null {
  const parts: string[] = [];
  if (event.start_date) {
    let line = `Desde ${event.start_date}`;
    if (event.start_time) line += ` ${event.start_time}`;
    parts.push(line);
  }
  if (event.end_date) {
    let line = `Hasta ${event.end_date}`;
    if (event.end_time) line += ` ${event.end_time}`;
    parts.push(line);
  } else if (!event.start_date && event.start_time) {
    parts.push(`Hora inicio ${event.start_time}`);
  }
  if (!event.end_date && event.end_time && event.start_date) {
    parts.push(`Hora fin ${event.end_time}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function workforceStatusBadgeClass(status: WorkforceEventStatus): string {
  switch (status) {
    case "TAKEN":
    case "APPROVED":
      return "bg-orbit-success/10 text-orbit-success border-orbit-success/25";
    case "NOT_TAKEN":
    case "PENDING":
      return "bg-orbit-warning/10 text-orbit-warning border-orbit-warning/30";
    case "REJECTED":
    case "CANCELLED":
      return "bg-red-50 text-red-600 border-red-100";
    default:
      return "bg-orbit-bg-secondary text-orbit-text-secondary border-orbit-border";
  }
}
