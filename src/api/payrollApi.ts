import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

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
  /** ORG_TOTAL = کل مرکز؛ ASSIGNED = منتسب به این کاربر */
  students_count_scope?: "ORG_TOTAL" | "ASSIGNED";
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

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت خلاصه حقوق";
    throw new Error(msg);
  }
  return data as PayrollSummary;
}

/** بازمحاسبهٔ همهٔ فیش‌های در انتظار این ماه از پرداخت‌ها و قوانین نقش. */
export async function recalculatePayrollPeriod(params: {
  year: number;
  month: number;
}): Promise<{ ok: boolean; year: number; month: number }> {
  const url = new URL(`${API_BASE}/payroll/recalculate-period`);
  url.searchParams.set("year", String(params.year));
  url.searchParams.set("month", String(params.month));
  const res = await authFetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در بازمحاسبه حقوق";
    throw new Error(msg);
  }
  return data as { ok: boolean; year: number; month: number };
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

  const res = await authFetch(url.toString(), {
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
  const res = await authFetch(`${API_BASE}/payroll/entries/${id}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (data && data.error) || "خطا در دریافت فیش حقوقی";
    throw new Error(msg);
  }
  return data as PayrollEntryApi;
}

export interface PayrollPreview {
  base_salary_cents: number;
  variable_salary_cents: number;
  students_count: number;
  students_count_scope?: "ORG_TOTAL" | "ASSIGNED";
  /** جمع سهم «درصد از مبلغ کل پرداخت» برای این کاربر در این ماه */
  role_gross_share_cents?: number;
  compensation_kind: string;
  revenue_volume_cents: number;
  period_year: number;
  period_month: number;
}

export async function getPayrollPreview(params: {
  user_id: number;
  year: number;
  month: number;
}): Promise<PayrollPreview> {
  const url = new URL(`${API_BASE}/payroll/preview`);
  url.searchParams.set("user_id", String(params.user_id));
  url.searchParams.set("year", String(params.year));
  url.searchParams.set("month", String(params.month));
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در پیش‌نمایش حقوق");
  }
  return data as PayrollPreview;
}

export interface CreatePayrollEntryPayload {
  user_id: number;
  period_year: number;
  period_month: number;
  /** When true, server fills amounts from role + payments (recommended). */
  apply_role_rules?: boolean;
  base_salary_cents?: number;
  variable_salary_cents?: number;
  students_count?: number;
  status: string;
}

export async function createPayrollEntry(
  payload: CreatePayrollEntryPayload
): Promise<PayrollEntryApi> {
  const res = await authFetch(`${API_BASE}/payroll/entries`, {
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
  /** Recompute base/variable/students from role rules for this entry's period */
  recalculate_from_role_rules?: boolean;
  base_salary_cents?: number;
  variable_salary_cents?: number;
  students_count?: number;
  status?: string;
  /** Gregorian YYYY-MM-DD */
  paid_at?: string | null;
}

export async function updatePayrollEntry(
  id: number,
  payload: UpdatePayrollEntryPayload
): Promise<PayrollEntryApi> {
  const res = await authFetch(`${API_BASE}/payroll/entries/${id}`, {
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

export interface AdvisorOpsApi {
  user_id: number;
  first_name: string;
  last_name: string;
  role_id: number;
  role_code: string;
  role_name: string;
  students_total: number;
  students_school: number;
  students_private: number;
  students_online: number;
  students_in_person: number;
  paid_count_this_month: number;
  unpaid_count_this_month: number;
  expected_total_cents: number;
  paid_total_cents: number;
  remaining_cents: number;
  salary_total_cents: number;
  salary_status?: string;
}

export interface AdvisorOpsStudentApi {
  student_id: number;
  first_name: string;
  last_name: string;
  delivery_mode?: string;
  enrollment_billing_mode: string;
  registration_channel: string;
  school_name?: string;
  enrollment_amount_cents: number;
  paid_total_cents: number;
  remaining_balance_cents: number;
  has_paid_this_month: boolean;
}

export interface AdvisorOpsSalaryApi {
  id: number;
  period_year: number;
  period_month: number;
  base_salary_cents: number;
  variable_salary_cents: number;
  total_salary_cents: number;
  students_count: number;
  students_count_scope?: "ORG_TOTAL" | "ASSIGNED";
  status: string;
  paid_at?: string | null;
}

export interface AdvisorOpsPaymentApi {
  id: number;
  student_id: number;
  student_name: string;
  amount_cents: number;
  status: string;
  paid_at?: string | null;
  description?: string;
}

export interface AdvisorOpsUserDetailApi {
  user_id: number;
  first_name: string;
  last_name: string;
  role_code: string;
  role_name: string;
  students_total: number;
  students_count_scope?: "ORG_TOTAL" | "ASSIGNED";
  payments_count: number;
  payments_total_cents: number;
  salaries_count: number;
  salaries_paid_count: number;
  salaries_total_cents: number;
  salaries_paid_cents: number;
  expected_total_cents: number;
  students_paid_total_cents: number;
  remaining_cents: number;
  students: AdvisorOpsStudentApi[];
  salaries: AdvisorOpsSalaryApi[];
  payments: AdvisorOpsPaymentApi[];
}

export async function listAdvisorOps(params?: {
  year?: number;
  month?: number;
}): Promise<{ period_year: number; period_month: number; data: AdvisorOpsApi[] }> {
  const url = new URL(`${API_BASE}/payroll/advisor-ops`);
  if (params?.year != null) url.searchParams.set("year", String(params.year));
  if (params?.month != null) url.searchParams.set("month", String(params.month));
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در دریافت خلاصه افراد");
  }
  return data as { period_year: number; period_month: number; data: AdvisorOpsApi[] };
}

export async function listAdvisorOpsStudents(
  userId: number,
  params?: { year?: number; month?: number },
): Promise<AdvisorOpsStudentApi[]> {
  const url = new URL(`${API_BASE}/payroll/advisor-ops/${userId}/students`);
  if (params?.year != null) url.searchParams.set("year", String(params.year));
  if (params?.month != null) url.searchParams.set("month", String(params.month));
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در دریافت لیست دانش‌آموزان");
  }
  return ((data as { data?: AdvisorOpsStudentApi[] })?.data ?? []) as AdvisorOpsStudentApi[];
}

export async function getAdvisorOpsUserDetail(
  userId: number,
  params?: { year?: number; month?: number },
): Promise<AdvisorOpsUserDetailApi> {
  const url = new URL(`${API_BASE}/payroll/advisor-ops/${userId}/detail`);
  if (params?.year != null) url.searchParams.set("year", String(params.year));
  if (params?.month != null) url.searchParams.set("month", String(params.month));
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در دریافت جزئیات کاربر");
  }
  return data as AdvisorOpsUserDetailApi;
}

export interface PaymentShareLineApi {
  share_id: number;
  payment_id: number;
  student_id: number;
  student_name: string;
  enrollment_billing_mode: string;
  kind: string;
  share_cents: number;
  basis_amount_cents: number;
  payment_amount_cents: number;
  paid_at?: string | null;
}

export interface AccrualShareLineApi {
  student_id: number;
  student_name: string;
  enrollment_billing_mode: string;
  enrollment_amount_cents: number;
  contract_share_total_cents: number;
  share_cents: number;
  accrual_month_index: number;
  accrual_months_total: number;
  remaining_months: number;
  label: string;
}

export interface PayrollBreakdownApi {
  user_id: number;
  period_year: number;
  period_month: number;
  base_salary_cents: number;
  variable_salary_cents: number;
  total_salary_cents: number;
  payment_shares_cents: number;
  accrual_shares_cents: number;
  students_count: number;
  students_count_scope?: "ORG_TOTAL" | "ASSIGNED";
  compensation_kind: string;
  payment_share_lines: PaymentShareLineApi[];
  accrual_share_lines: AccrualShareLineApi[];
  entry_id?: number;
  entry_status?: string;
  entry_locked: boolean;
}

export async function getPayrollUserBreakdown(params: {
  user_id: number;
  year: number;
  month: number;
}): Promise<PayrollBreakdownApi> {
  const url = new URL(`${API_BASE}/payroll/users/${params.user_id}/breakdown`);
  url.searchParams.set("year", String(params.year));
  url.searchParams.set("month", String(params.month));
  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در دریافت شکست محاسبه حقوق");
  }
  return data as PayrollBreakdownApi;
}

export async function recalculatePayrollUser(params: {
  user_id: number;
  year: number;
  month: number;
}): Promise<{ entry: PayrollEntryApi; breakdown: PayrollBreakdownApi }> {
  const url = new URL(`${API_BASE}/payroll/users/${params.user_id}/recalculate`);
  url.searchParams.set("year", String(params.year));
  url.searchParams.set("month", String(params.month));
  const res = await authFetch(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "خطا در محاسبه فیش حقوقی");
  }
  return data as { entry: PayrollEntryApi; breakdown: PayrollBreakdownApi };
}

