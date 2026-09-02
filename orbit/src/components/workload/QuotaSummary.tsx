import React from "react";
import { cn } from "@/src/lib/utils";
import {
  QUOTA_STATUS_LABEL,
  TEACHING_MODALITY_LABEL,
  formatQuotaRatio,
  quotaStatusBadgeClass,
  teachingModalityBadgeClass,
  type QuotaStatus,
  type TeachingModality,
  type WorkloadQuotaFields,
} from "@/src/lib/workloadQuotaDisplay";

function Badge({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-md border px-2 py-0.5 text-[11px] font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}

export const QuotaSummary: React.FC<{
  quota: WorkloadQuotaFields;
  compact?: boolean;
}> = ({ quota, compact }) => {
  const modality = quota.teachingModality as TeachingModality | null;
  const status = (quota.quotaStatus ?? "unknown") as QuotaStatus;
  const showCredits = modality === "presencial" || modality === "mixto";
  const showStudents = modality === "virtual" || modality === "mixto";

  return (
    <div className={cn("space-y-1", compact ? "text-xs" : "text-sm")}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Badge className={teachingModalityBadgeClass(modality)}>
          {modality ? TEACHING_MODALITY_LABEL[modality] : "Sin carga"}
        </Badge>
        <Badge className={quotaStatusBadgeClass(status)}>
          {quota.fulfillmentPct != null
            ? `${quota.fulfillmentPct}% · ${QUOTA_STATUS_LABEL[status]}`
            : QUOTA_STATUS_LABEL[status]}
        </Badge>
      </div>
      <div className="text-xs text-orbit-muted space-y-0.5 tabular-nums">
        {showCredits && (
          <div>
            Créditos P:{" "}
            <span className="font-medium text-orbit-text-secondary">
              {formatQuotaRatio(quota.creditsPresencial, quota.creditTarget)}
            </span>
          </div>
        )}
        {showStudents && (
          <div>
            Estudiantes V:{" "}
            <span className="font-medium text-orbit-text-secondary">
              {formatQuotaRatio(quota.studentsVirtual, quota.studentTarget)}
            </span>
          </div>
        )}
        {!modality && (
          <div>Sin asignaciones P/V para calcular cuota</div>
        )}
      </div>
    </div>
  );
};
