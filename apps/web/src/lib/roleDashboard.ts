import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { UserType } from "./types";

export type DashboardRole = Exclude<UserType, "administrator">;

const DASHBOARD_REFRESH_MS = 60_000;

/** One cached, auto-refreshing query per role dashboard BFF (`/api/v1/dashboard/{role}`). */
export function useRoleDashboard<T>(role: DashboardRole) {
  return useQuery<T>({
    queryKey: ["dashboard", role],
    queryFn: () => api<T>(`/api/v1/dashboard/${role}`),
    refetchInterval: DASHBOARD_REFRESH_MS,
    retry: 1,
  });
}

/* ── Shapes shared by the role dashboard BFFs ── */

export interface StatCard {
  value: number | string;
  label: string;
  unit?: string;
}

export type WorkStatus = "pending" | "submitted" | "graded" | "overdue";

export interface WorkItem {
  title: string;
  subject: string;
  due: string;
  status: WorkStatus;
  score?: string;
}

export interface FeeSummaryData {
  total: number;
  paid: number;
  balance: number;
  nextDue: string;
}

/** Badge tone for an assignment or homework item; same meaning on every dashboard. */
export function workTone(status: WorkStatus) {
  switch (status) {
    case "graded": return "ok" as const;
    case "submitted": return "info" as const;
    case "overdue": return "danger" as const;
    case "pending": return "warn" as const;
  }
}

export function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function todayLabel(date = new Date()): string {
  return date.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}
