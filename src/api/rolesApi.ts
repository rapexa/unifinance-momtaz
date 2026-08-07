import {API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

export type CompensationKind = "FIXED" | "VARIABLE" | "NET_REVENUE";

export interface RoleApi {
  id: number;
  code: string;
  name: string;
  description?: string;
  is_system: boolean;
  full_access: boolean;
  compensation_kind: CompensationKind;
  /** مبلغ ثابت ماهانه — فقط برای FIXED */
  fixed_cents?: number | null;
  /** تعداد ماه‌های حقوق در سال (مثلاً ۱۰ مشاور، ۱۲ منشی) */
  payroll_months_count?: number | null;
  permissions?: string[];
}

export interface CreateRolePayload {
  code: string;
  name: string;
  description?: string;
  full_access?: boolean;
  compensation_kind: CompensationKind;
  /** برای FIXED الزامی است */
  fixed_cents?: number;
  payroll_months_count?: number;
  permissions?: string[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  full_access?: boolean;
  compensation_kind?: CompensationKind;
  fixed_cents?: number | null;
  payroll_months_count?: number | null;
  permissions?: string[];
}

export async function listRoles(): Promise<RoleApi[]> {
  const res = await authFetch(`${API_BASE}/roles`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت نقش‌ها", res);
  return (data?.data ?? []) as RoleApi[];
}

export async function createRole(payload: CreateRolePayload): Promise<RoleApi> {
  const res = await authFetch(`${API_BASE}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "ثبت نقش با خطا مواجه شد", res);
  return data as RoleApi;
}

export async function updateRole(
  id: number,
  payload: UpdateRolePayload
): Promise<RoleApi> {
  const res = await authFetch(`${API_BASE}/roles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "به‌روزرسانی نقش با خطا مواجه شد", res);
  return data as RoleApi;
}

export async function deleteRole(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/roles/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "حذف نقش با خطا مواجه شد", res);
}
