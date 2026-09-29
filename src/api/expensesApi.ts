import { API_BASE, authFetch, getAuthHeaders, apiFail } from "./apiClient";

export interface CostCenterApi {
  id: number;
  name: string;
  /** SALARY = حقوق (از پرداخت به کارکنان) | GENERAL */
  kind: "SALARY" | "GENERAL";
  description?: string;
  is_system: boolean;
  is_active: boolean;
  sort_order: number;
}

export interface CostCenterTotalApi extends CostCenterApi {
  month_cents: number;
  to_date_cents: number;
  month_count: number;
}

export interface ExpenseSummaryApi {
  period_year: number;
  period_month: number;
  centers: CostCenterTotalApi[];
  salary_month_cents: number;
  salary_to_date_cents: number;
  other_month_cents: number;
  other_to_date_cents: number;
  total_month_cents: number;
  total_to_date_cents: number;
}

export interface ExpenseLineApi {
  id: number;
  /** EXPENSE | PAYOUT (پرداخت حقوق) */
  kind: "EXPENSE" | "PAYOUT";
  cost_center_id: number;
  cost_center_name: string;
  amount_cents: number;
  paid_at: string;
  description?: string;
  bank_account_id?: number;
  bank_account_title?: string;
  user_id?: number;
  user_name?: string;
}

export interface ExpensePayload {
  cost_center_id: number;
  amount_cents: number;
  paid_at: string;
  description?: string;
  bank_account_id?: number;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, fallback, res);
  return data as T;
}

export async function getExpenseSummary(year: number, month: number): Promise<ExpenseSummaryApi> {
  const url = new URL(`${API_BASE}/expenses/summary`);
  url.searchParams.set("year", String(year));
  url.searchParams.set("month", String(month));
  const res = await authFetch(url.toString(), { headers: getAuthHeaders() });
  const data = await json<ExpenseSummaryApi>(res, "خطا در دریافت خلاصه هزینه‌ها");
  return { ...data, centers: data?.centers ?? [] };
}

export async function listExpenseLines(params: {
  year: number;
  month: number;
  cost_center_id?: number;
  scope?: "month" | "to_date";
}): Promise<{ data: ExpenseLineApi[]; total_cents: number }> {
  const url = new URL(`${API_BASE}/expenses`);
  url.searchParams.set("year", String(params.year));
  url.searchParams.set("month", String(params.month));
  if (params.cost_center_id) url.searchParams.set("cost_center_id", String(params.cost_center_id));
  if (params.scope) url.searchParams.set("scope", params.scope);
  const res = await authFetch(url.toString(), { headers: getAuthHeaders() });
  const data = await json<{ data: ExpenseLineApi[]; total_cents: number }>(res, "خطا در دریافت هزینه‌ها");
  return { data: data?.data ?? [], total_cents: data?.total_cents ?? 0 };
}

export async function createExpense(payload: ExpensePayload): Promise<void> {
  const res = await authFetch(`${API_BASE}/expenses`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  await json(res, "خطا در ثبت هزینه");
}

export async function updateExpense(id: number, payload: ExpensePayload): Promise<void> {
  const res = await authFetch(`${API_BASE}/expenses/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  await json(res, "خطا در ویرایش هزینه");
}

export async function deleteExpense(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/expenses/${id}`, { method: "DELETE", headers: getAuthHeaders() });
  if (!res.ok) await json(res, "خطا در حذف هزینه");
}

export async function listCostCenters(): Promise<CostCenterApi[]> {
  const res = await authFetch(`${API_BASE}/cost-centers`, { headers: getAuthHeaders() });
  const data = await json<{ data: CostCenterApi[] }>(res, "خطا در دریافت مراکز هزینه");
  return data?.data ?? [];
}

export async function createCostCenter(payload: {
  name: string;
  description?: string;
  is_active?: boolean;
  sort_order?: number;
}): Promise<CostCenterApi> {
  const res = await authFetch(`${API_BASE}/cost-centers`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return json<CostCenterApi>(res, "خطا در ثبت مرکز هزینه");
}

export async function updateCostCenter(
  id: number,
  payload: { name: string; description?: string; is_active?: boolean; sort_order?: number },
): Promise<CostCenterApi> {
  const res = await authFetch(`${API_BASE}/cost-centers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  return json<CostCenterApi>(res, "خطا در ویرایش مرکز هزینه");
}

export async function deleteCostCenter(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/cost-centers/${id}`, { method: "DELETE", headers: getAuthHeaders() });
  if (!res.ok) await json(res, "خطا در حذف مرکز هزینه");
}
