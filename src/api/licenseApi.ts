import { API_BASE, authFetch, getAuthHeaders, apiFail } from "./apiClient";

/** DISABLED = نسخه بدون لایسنس (نامحدود) · OWNER = نسخه مالک (رایگان و نامحدود) */
export type LicenseState = "DISABLED" | "OWNER" | "VALID" | "GRACE" | "EXPIRED" | "MISSING" | "INVALID";

export interface LicenseStatusApi {
  enabled: boolean;
  /** نسخه مالک: همه امکانات رایگان و بدون محدودیت */
  owner?: boolean;
  state: LicenseState;
  read_only: boolean;
  students: number;
  users: number;
  grace_days: number;
  error_detail?: string;
  license_id?: string;
  customer?: string;
  plan?: string;
  /** 0 = نامحدود */
  max_students?: number;
  max_users?: number;
  issued_at?: string;
  expires_at?: string;
  days_left?: number;
}

export async function getLicense(): Promise<LicenseStatusApi> {
  const res = await authFetch(`${API_BASE}/license`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت وضعیت اشتراک", res);
  return data as LicenseStatusApi;
}

export async function updateLicense(key: string): Promise<LicenseStatusApi> {
  const res = await authFetch(`${API_BASE}/license`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ key }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در ثبت کلید لایسنس", res);
  return data as LicenseStatusApi;
}

export const PLAN_LABELS: Record<string, string> = {
  trial: "آزمایشی",
  free: "رایگان",
  basic: "پایه",
  pro: "حرفه‌ای",
  enterprise: "سازمانی",
  onprem: "نصب روی سرور شما",
};

export function planLabel(plan?: string): string {
  if (!plan) return "—";
  return PLAN_LABELS[plan] ?? plan;
}
