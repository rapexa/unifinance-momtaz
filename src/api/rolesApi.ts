const DEFAULT_API_BASE = "https://api.mali-momtazisho.ir/api/v1";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL) ||
  DEFAULT_API_BASE;

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
  permissions?: string[];
}

export interface UpdateRolePayload {
  name?: string;
  description?: string;
  full_access?: boolean;
  compensation_kind?: CompensationKind;
  fixed_cents?: number | null;
  permissions?: string[];
}

export async function listRoles(): Promise<RoleApi[]> {
  const res = await fetch(`${API_BASE}/roles`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت نقش‌ها");
  return (data?.data ?? []) as RoleApi[];
}

export async function createRole(payload: CreateRolePayload): Promise<RoleApi> {
  const res = await fetch(`${API_BASE}/roles`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "ثبت نقش با خطا مواجه شد");
  return data as RoleApi;
}

export async function updateRole(
  id: number,
  payload: UpdateRolePayload
): Promise<RoleApi> {
  const res = await fetch(`${API_BASE}/roles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "به‌روزرسانی نقش با خطا مواجه شد");
  return data as RoleApi;
}

export async function deleteRole(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/roles/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "حذف نقش با خطا مواجه شد");
}
