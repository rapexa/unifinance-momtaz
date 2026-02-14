const DEFAULT_API_BASE = "http://localhost:8081/api/v1";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL) ||
  DEFAULT_API_BASE;

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface DashboardKPIs {
  total_revenue_cents: number;
  pending_debt_cents: number;
  overdue_debt_cents: number;
  active_students: number;
  monthly_payroll_cents: number;
}

export interface DashboardPayment {
  id: number;
  student_id: number;
  student_name: string;
  amount_cents: number;
  currency: string;
  status: string;
  method: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  description?: string;
}

export interface DebtAlertItem {
  student_id: number;
  student_name: string;
  amount_cents: number;
  days_overdue: number;
}

export interface DashboardSummary {
  kpis: DashboardKPIs;
  recent_payments: DashboardPayment[];
  debt_alerts: DebtAlertItem[];
}

export interface RevenueTrendPoint {
  year: number;
  month: number;
  revenue_cents: number;
  payroll_cents: number;
}

export async function getDashboardSummary(params?: {
  recent_limit?: number;
  alerts_limit?: number;
}): Promise<DashboardSummary> {
  const url = new URL(`${API_BASE}/dashboard/summary`);
  if (params?.recent_limit != null) url.searchParams.set("recent_limit", String(params.recent_limit));
  if (params?.alerts_limit != null) url.searchParams.set("alerts_limit", String(params.alerts_limit));

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت خلاصه داشبورد");
  return data as DashboardSummary;
}

export async function getRevenueTrend(params?: { months?: number }): Promise<RevenueTrendPoint[]> {
  const url = new URL(`${API_BASE}/dashboard/revenue-trend`);
  if (params?.months != null) url.searchParams.set("months", String(params.months));

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت نمودار");
  return data as RevenueTrendPoint[];
}
