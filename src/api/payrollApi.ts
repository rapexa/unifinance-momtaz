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

export interface PayrollSummary {
  period_year: number;
  period_month: number;
  total_base_cents: number;
  total_variable_cents: number;
  total_paid_cents: number;
  total_pending_cents: number;
}

export interface PayrollEntryApi {
  id: number;
  user_id: number;
  user_first_name: string;
  user_last_name: string;
  user_role: string;
  period_year: number;
  period_month: number;
  base_salary_cents: number;
  variable_salary_cents: number;
  total_salary_cents: number;
  students_count: number;
  status: string;
  paid_at: string | null;
  created_at: string;
}

export interface PaginatedPayrollEntriesResponse {
  data: PayrollEntryApi[];
  meta: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface ListPayrollEntriesParams {
  year?: number;
  month?: number;
  page?: number;
  page_size?: number;
  status?: string;
  user_id?: number;
}

export async function getPayrollSummary(params?: {
  year?: number;
  month?: number;
}): Promise<PayrollSummary> {
  const url = new URL(`${API_BASE}/payroll/summary`);
  if (params?.year != null) url.searchParams.set("year", String(params.year));
  if (params?.month != null) url.searchParams.set("month", String(params.month));

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت خلاصه حقوق";
    throw new Error(msg);
  }
  return data as PayrollSummary;
}

export async function listPayrollEntries(
  params: ListPayrollEntriesParams = {}
): Promise<PaginatedPayrollEntriesResponse> {
  const url = new URL(`${API_BASE}/payroll/entries`);
  if (params.year != null) url.searchParams.set("year", String(params.year));
  if (params.month != null) url.searchParams.set("month", String(params.month));
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.page_size ?? 50));
  if (params.status) url.searchParams.set("status", params.status);
  if (params.user_id != null) url.searchParams.set("user_id", String(params.user_id));

  const res = await fetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت لیست حقوق";
    throw new Error(msg);
  }
  return data as PaginatedPayrollEntriesResponse;
}

export async function getPayrollEntry(id: number): Promise<PayrollEntryApi> {
  const res = await fetch(`${API_BASE}/payroll/entries/${id}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت فیش حقوقی";
    throw new Error(msg);
  }
  return data as PayrollEntryApi;
}

export interface CreatePayrollEntryPayload {
  user_id: number;
  period_year: number;
  period_month: number;
  base_salary_cents: number;
  variable_salary_cents: number;
  students_count: number;
  status: string;
}

export async function createPayrollEntry(
  payload: CreatePayrollEntryPayload
): Promise<PayrollEntryApi> {
  const res = await fetch(`${API_BASE}/payroll/entries`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "ثبت حقوق با خطا مواجه شد";
    throw new Error(msg);
  }
  return data as PayrollEntryApi;
}

export interface UpdatePayrollEntryPayload {
  base_salary_cents?: number;
  variable_salary_cents?: number;
  students_count?: number;
  status?: string;
}

export async function updatePayrollEntry(
  id: number,
  payload: UpdatePayrollEntryPayload
): Promise<PayrollEntryApi> {
  const res = await fetch(`${API_BASE}/payroll/entries/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "ویرایش حقوق با خطا مواجه شد";
    throw new Error(msg);
  }
  return data as PayrollEntryApi;
}
