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

export interface ReportSummary {
  total_revenue_cents: number;
  total_payroll_cents: number;
  total_debt_cents: number;
  net_profit_cents: number;
}

export interface RevenuePoint {
  year: number;
  month: number;
  revenue_cents: number;
}

export interface PayrollPoint {
  year: number;
  month: number;
  payroll_cents: number;
}

export interface AdvisorDebt {
  advisor_id: number;
  advisor_name: string;
  debt_cents: number;
}

export interface ReportFilter {
  from: string; // YYYY-MM
  to: string;   // YYYY-MM
}

export async function getReportsSummary(params: ReportFilter): Promise<ReportSummary> {
  const url = new URL(`${API_BASE}/reports/summary`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت خلاصه گزارش";
    throw new Error(msg);
  }
  return data as ReportSummary;
}

export async function getRevenueSeries(params: ReportFilter): Promise<RevenuePoint[]> {
  const url = new URL(`${API_BASE}/reports/revenue`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت سری درآمد";
    throw new Error(msg);
  }
  return data as RevenuePoint[];
}

export async function getPayrollSeries(params: ReportFilter): Promise<PayrollPoint[]> {
  const url = new URL(`${API_BASE}/reports/payroll`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت سری حقوق";
    throw new Error(msg);
  }
  return data as PayrollPoint[];
}

export async function getDebtsByAdvisor(params?: { month?: string }): Promise<AdvisorDebt[]> {
  const url = new URL(`${API_BASE}/reports/debts`);
  const now = new Date();
  const month = params?.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  url.searchParams.set("month", month);

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت بدهی‌ها";
    throw new Error(msg);
  }
  return data as AdvisorDebt[];
}
