import {API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

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

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت خلاصه گزارش", res);
  }
  return data as ReportSummary;
}

export async function getRevenueSeries(params: ReportFilter): Promise<RevenuePoint[]> {
  const url = new URL(`${API_BASE}/reports/revenue`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت سری درآمد", res);
  }
  return data as RevenuePoint[];
}

export async function getPayrollSeries(params: ReportFilter): Promise<PayrollPoint[]> {
  const url = new URL(`${API_BASE}/reports/payroll`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت سری حقوق", res);
  }
  return data as PayrollPoint[];
}

export interface PaidPaymentDetail {
  id: number;
  paid_at: string | null;
  amount_cents: number;
  method: string;
  student_id: number;
  student_name: string;
  description?: string;
  advisor_name?: string;
}

export interface RevenueByStudent {
  student_id: number;
  student_name: string;
  total_cents: number;
  payment_count: number;
  advisor_name?: string;
}

export interface PayrollLineDetail {
  user_id: number;
  user_name: string;
  role_code?: string;
  period_year: number;
  period_month: number;
  base_salary_cents: number;
  variable_salary_cents: number;
  total_salary_cents: number;
  status: string;
  paid_at?: string | null;
}

export interface PayrollByUser {
  user_id: number;
  user_name: string;
  role_code?: string;
  total_cents: number;
  paid_cents: number;
  pending_cents: number;
  entry_count: number;
}

export interface StudentDebtDetail {
  student_id: number;
  student_name: string;
  balance_cents: number;
  advisor_name?: string;
}

export async function getReportPaidPayments(params: ReportFilter): Promise<PaidPaymentDetail[]> {
  const url = new URL(`${API_BASE}/reports/revenue/payments`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت جزئیات پرداخت‌ها", res);
  return (data?.data ?? []) as PaidPaymentDetail[];
}

export async function getReportRevenueByStudent(params: ReportFilter): Promise<RevenueByStudent[]> {
  const url = new URL(`${API_BASE}/reports/revenue/by-student`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت تجمیع دانش‌آموز", res);
  return (data?.data ?? []) as RevenueByStudent[];
}

export async function getReportPayrollLines(params: ReportFilter): Promise<PayrollLineDetail[]> {
  const url = new URL(`${API_BASE}/reports/payroll/lines`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت جزئیات حقوق", res);
  return (data?.data ?? []) as PayrollLineDetail[];
}

export async function getReportPayrollByUser(params: ReportFilter): Promise<PayrollByUser[]> {
  const url = new URL(`${API_BASE}/reports/payroll/by-user`);
  url.searchParams.set("from", params.from);
  url.searchParams.set("to", params.to);
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت حقوق به تفکیک کارمند", res);
  return (data?.data ?? []) as PayrollByUser[];
}

export async function getReportStudentDebts(): Promise<StudentDebtDetail[]> {
  const url = new URL(`${API_BASE}/reports/debts/students`);
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت بدهی دانش‌آموزان", res);
  return (data?.data ?? []) as StudentDebtDetail[];
}

export async function getDebtsByAdvisor(params?: { month?: string }): Promise<AdvisorDebt[]> {
  const url = new URL(`${API_BASE}/reports/debts`);
  const now = new Date();
  const month = params?.month ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  url.searchParams.set("month", month);

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت بدهی‌ها", res);
  }
  return data as AdvisorDebt[];
}
