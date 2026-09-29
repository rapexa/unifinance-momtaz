import {API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

export interface DashboardKPIs {
  total_revenue_cents: number;
  pending_debt_cents: number;
  overdue_debt_cents: number;
  active_students: number;
  student_registrations_this_month: number;
  monthly_payroll_cents: number;
  /** مجموع مانده بدهی دانش‌آموزان فعال (ثبت‌نامی − پرداخت‌شده) */
  student_debt_cents: number;
}

export interface DashboardPayment {
  id: number;
  student_id: number;
  student_name: string;
  student_phone?: string;
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

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت خلاصه داشبورد", res);
  return data as DashboardSummary;
}

export async function getRevenueTrend(params?: { months?: number }): Promise<RevenueTrendPoint[]> {
  const url = new URL(`${API_BASE}/dashboard/revenue-trend`);
  if (params?.months != null) url.searchParams.set("months", String(params.months));

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت نمودار", res);
  return data as RevenueTrendPoint[];
}

// --- Finance dashboard (admins) ---

export interface OverviewKPI {
  value_cents: number;
  /** Same figure for the previous month (absent when unknown). */
  previous_cents?: number;
  /** Last 6 months, oldest first. */
  spark_cents: number[];
}

export interface OverviewUpcoming {
  /** STUDENT = دریافتنی | SALARY | EXPENSE = پرداختنی */
  kind: "STUDENT" | "SALARY" | "EXPENSE";
  title: string;
  subtitle?: string;
  due_date: string;
  days_left: number;
  amount_cents: number;
  student_id?: number;
}

export interface OverviewTransaction {
  /** RECEIPT = دریافت از دانش‌آموز | PAYOUT = پرداخت حقوق | EXPENSE = هزینه */
  kind: "RECEIPT" | "PAYOUT" | "EXPENSE";
  id: number;
  date: string;
  title: string;
  category: string;
  counterparty?: string;
  /** Positive = inflow, negative = outflow. */
  amount_cents: number;
  status: string;
}

export interface DashboardOverview {
  period_year: number;
  period_month: number;
  kpis: {
    cash: OverviewKPI;
    income: OverviewKPI;
    expenses: OverviewKPI;
    profit: OverviewKPI;
    overdue: OverviewKPI;
  };
  action: {
    overdue_count: number;
    overdue_cents: number;
    pending_count: number;
    pending_cents: number;
    payroll_count: number;
    payroll_cents: number;
  };
  cash_flow: {
    in_cents: number;
    out_cents: number;
    net_cents: number;
    prev_in_cents: number;
    prev_out_cents: number;
    prev_net_cents: number;
  };
  aging: { overdue_cents: number; d1_30_cents: number; d31_60_cents: number; d60_plus_cents: number };
  students: { active: number; registrations: number };
  series: { year: number; month: number; income_cents: number; outflow_cents: number; profit_cents: number }[];
  upcoming: OverviewUpcoming[];
  recent: OverviewTransaction[];
}

export async function getDashboardOverview(year: number, month: number): Promise<DashboardOverview> {
  const url = new URL(`${API_BASE}/dashboard/overview`);
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت داشبورد مالی", res);
  return data as DashboardOverview;
}
