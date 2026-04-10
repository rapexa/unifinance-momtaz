import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

export interface CompensationRuleApi {
  id: number;
  name: string;
  is_active: boolean;
  priority: number;
  target_kind: "ADVISOR_CONTRACT" | "ROLE" | "USER";
  amount_kind: "FIXED" | "PERCENT";
  scope_kind: "ALL_STUDENTS" | "SELECTED_STUDENTS" | "CAPACITY";
  payment_type: "ALL" | "SINGLE_SESSION" | "MONTHLY" | "COURSE";
  role_id?: number;
  user_id?: number;
  fixed_cents?: number;
  percent?: number;
  capacity_limit?: number;
  students?: Array<{ student_id: number }>;
}

export interface UpsertCompensationRulePayload {
  name: string;
  is_active: boolean;
  priority: number;
  target_kind: "ADVISOR_CONTRACT" | "ROLE" | "USER";
  amount_kind: "FIXED" | "PERCENT";
  scope_kind: "ALL_STUDENTS" | "SELECTED_STUDENTS" | "CAPACITY";
  payment_type: "ALL" | "SINGLE_SESSION" | "MONTHLY" | "COURSE";
  role_id?: number;
  user_id?: number;
  fixed_cents?: number;
  percent?: number;
  capacity_limit?: number;
}

export async function listCompensationRules(): Promise<CompensationRuleApi[]> {
  const res = await authFetch(`${API_BASE}/settings/compensation-rules`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت قوانین تسهیم");
  return (data?.data ?? []) as CompensationRuleApi[];
}

export async function createCompensationRule(payload: UpsertCompensationRulePayload): Promise<CompensationRuleApi> {
  const res = await authFetch(`${API_BASE}/settings/compensation-rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ایجاد قانون تسهیم");
  return data as CompensationRuleApi;
}

export async function updateCompensationRule(id: number, payload: UpsertCompensationRulePayload): Promise<CompensationRuleApi> {
  const res = await authFetch(`${API_BASE}/settings/compensation-rules/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ویرایش قانون تسهیم");
  return data as CompensationRuleApi;
}

export async function deleteCompensationRule(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/settings/compensation-rules/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در حذف قانون تسهیم");
}

export async function replaceCompensationRuleStudents(id: number, studentIds: number[]): Promise<void> {
  const res = await authFetch(`${API_BASE}/settings/compensation-rules/${id}/students`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ student_ids: studentIds }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ثبت دانش‌آموزان قانون");
}

