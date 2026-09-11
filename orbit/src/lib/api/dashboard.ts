import { BASE_URL } from "./config";
import { authFetch, handleJson, jsonHeaders } from "./http";

export type DashboardTrendType = "up" | "down" | "flat";

export type DashboardTrendUnit = "percent" | "absolute" | "none";

export type DashboardSummaryMetric = {
  value: number;
  trend: number;
  trendType: DashboardTrendType;
  trendUnit: DashboardTrendUnit;
  /** La dirección de la tendencia es favorable (define el color en UI). */
  trendGood: boolean;
  detail: string;
};

export type DashboardSummaryResponse = {
  activeTeachers: DashboardSummaryMetric & {
    capacityPercentage: number | null;
  };
  openVacancies: DashboardSummaryMetric & {
    averageDaysToClose: number | null;
    positionsOpen: number;
  };
  monthlyHires: DashboardSummaryMetric & {
    positionsFilled: number;
  };
  timeToHire: DashboardSummaryMetric & {
    sampleSize: number;
  };
  agingVacancies: DashboardSummaryMetric & {
    oldestDays: number | null;
  };
  todayNews: DashboardSummaryMetric & {
    criticalCount: number;
  };
  updatedAt: string;
};
export async function getDashboardSummary(): Promise<DashboardSummaryResponse> {
  const response = await authFetch(`${BASE_URL}/dashboard/summary`, {
    headers: jsonHeaders,
  });
  return handleJson(response);
}
