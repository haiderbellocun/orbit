import type { WorkforceEventStatus } from "@/src/lib/api";

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
      return "bg-emerald-50 text-emerald-700 border-emerald-100";
    case "NOT_TAKEN":
    case "PENDING":
      return "bg-amber-50 text-amber-700 border-amber-100";
    case "REJECTED":
    case "CANCELLED":
      return "bg-red-50 text-red-600 border-red-100";
    default:
      return "bg-slate-50 text-slate-600 border-slate-100";
  }
}
