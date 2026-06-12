import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

/** سروری که /uploads روی آن سرو می‌شود (بدون مسیر /api/v1). */
export function getApiOrigin(): string {
  const base = API_BASE.replace(/\/api\/v1\/?$/, "");
  return base.replace(/\/$/, "") || base;
}

/** لینک نسبی مثل /uploads/exports/x.csv را به URL کامل روی همان دامنهٔ API تبدیل می‌کند تا دانلود به فرانت نرود. */
export function absoluteUploadUrl(path: string | null | undefined): string | null {
  if (path == null || String(path).trim() === "") return null;
  const p = String(path).trim();
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  const origin = getApiOrigin();
  return `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
}

// --- Organization (General / CMS) ---
export interface OrganizationSettings {
  id: number;
  name: string;
  phone: string;
  address: string;
  email: string;
}

export async function getOrganization(): Promise<OrganizationSettings> {
  const res = await authFetch(`${API_BASE}/settings/organization`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت تنظیمات سازمان");
  return data as OrganizationSettings;
}

export async function updateOrganization(payload: Partial<OrganizationSettings>): Promise<OrganizationSettings> {
  const res = await authFetch(`${API_BASE}/settings/organization`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره تنظیمات سازمان");
  return data as OrganizationSettings;
}

// --- Profile (current user) ---
export interface Profile {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  role_id?: number;
  role_code?: string;
  role_name?: string;
  /** Role code (slug); same as role_code */
  role: string;
  avatar_url: string;
  bio: string;
  two_factor_enabled: boolean;
  permissions?: string[];
}

/** Permission codes returned by API (RBAC). */
export const PERMISSIONS = {
  DASHBOARD: "DASHBOARD",
  STUDENTS: "STUDENTS",
  USERS: "USERS",
  PLANS: "PLANS",
  PAYMENTS: "PAYMENTS",
  PAYROLL: "PAYROLL",
  REMINDERS: "REMINDERS",
  REPORTS: "REPORTS",
  SETTINGS: "SETTINGS",
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export async function getProfile(): Promise<Profile> {
  const res = await authFetch(`${API_BASE}/settings/profile`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت پروفایل");
  return data as Profile;
}

export async function updateProfile(payload: Partial<Profile>): Promise<Profile> {
  const res = await authFetch(`${API_BASE}/settings/profile`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره پروفایل");
  return data as Profile;
}

/** Base URL for uploaded files (e.g. avatars). Same origin as API but without /api/v1. */
export function getUploadsBase(): string {
  return API_BASE.replace(/\/api\/v1\/?$/, "") || "https://api.mali-momtazisho.ir";
}

export async function uploadProfileAvatar(file: File): Promise<Profile> {
  const formData = new FormData();
  formData.append("avatar", file);
  const res = await authFetch(`${API_BASE}/settings/profile/avatar`, {
    method: "POST",
    headers: getAuthHeaders(),
    body: formData,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در بارگذاری تصویر");
  return data as Profile;
}

// --- Security ---
export async function changePassword(current_password: string, new_password: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/settings/security/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ current_password, new_password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در تغییر رمز عبور");
}

export async function toggle2FA(enabled: boolean): Promise<void> {
  const res = await authFetch(`${API_BASE}/settings/security/2fa`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ enabled }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در تنظیم احراز هویت دو مرحله‌ای");
}

// --- Notifications ---
export interface NotificationSettingItem {
  type: string;
  enabled: boolean;
}

export async function getNotificationCount(): Promise<number> {
  const res = await authFetch(`${API_BASE}/settings/notifications/count`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return 0;
  return (data as { count?: number })?.count ?? 0;
}

export async function getNotifications(): Promise<NotificationSettingItem[]> {
  const res = await authFetch(`${API_BASE}/settings/notifications`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت تنظیمات اعلان‌ها");
  return data as NotificationSettingItem[];
}

export async function updateNotifications(settings: NotificationSettingItem[]): Promise<void> {
  const res = await authFetch(`${API_BASE}/settings/notifications`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ settings }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره اعلان‌ها");
}

// --- Fiscal Year ---
export interface FiscalYear {
  id: number;
  name: string;
  start_date: string;
  end_date: string | null;
  status: "OPEN" | "CLOSED";
  created_at: string;
  closed_at: string | null;
  export_url: string | null;
}

export interface CreateFiscalYearPayload {
  name: string;
  start_date: string;
}

export interface UpdateFiscalYearPayload {
  name: string;
}

export async function listFiscalYears(): Promise<FiscalYear[]> {
  const res = await authFetch(`${API_BASE}/fiscal-years`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت سال‌های مالی");
  return (data as FiscalYear[]) ?? [];
}

export async function getCurrentFiscalYear(): Promise<FiscalYear | null> {
  const res = await authFetch(`${API_BASE}/fiscal-years/current`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  if (res.status === 404) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت سال مالی جاری");
  return data as FiscalYear;
}

export async function createFiscalYear(payload: CreateFiscalYearPayload): Promise<FiscalYear> {
  const res = await authFetch(`${API_BASE}/fiscal-years`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ایجاد سال مالی");
  return data as FiscalYear;
}

export async function updateFiscalYear(id: number, payload: UpdateFiscalYearPayload): Promise<FiscalYear> {
  const res = await authFetch(`${API_BASE}/fiscal-years/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ویرایش سال مالی");
  return data as FiscalYear;
}

export async function closeFiscalYear(id: number): Promise<FiscalYear> {
  const res = await authFetch(`${API_BASE}/fiscal-years/${id}/close`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در بستن سال مالی");
  return data as FiscalYear;
}

export async function reopenFiscalYear(id: number): Promise<FiscalYear> {
  const res = await authFetch(`${API_BASE}/fiscal-years/${id}/reopen`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در باز کردن سال مالی");
  return data as FiscalYear;
}

export async function restoreFiscalYear(id: number): Promise<FiscalYear> {
  const res = await authFetch(`${API_BASE}/fiscal-years/${id}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در بازگردانی سال مالی");
  return data as FiscalYear;
}

/** Permanent removal — only for CLOSED fiscal years. */
export async function purgeFiscalYear(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/fiscal-years/${id}/permanent`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && data.error) || "حذف کامل سال مالی با خطا مواجه شد");
  }
}

// --- Payment settings ---
export interface PaymentSettings {
  card_number: string;
  iban: string;
  gateway_provider: string;
  gateway_merchant_id: string;
  gateway_callback_url: string;
  is_gateway_connected: boolean;
}

export async function getPaymentSettings(): Promise<PaymentSettings> {
  const res = await authFetch(`${API_BASE}/settings/payments`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت تنظیمات پرداخت");
  return data as PaymentSettings;
}

export async function updatePaymentSettings(payload: Partial<PaymentSettings>): Promise<PaymentSettings> {
  const res = await authFetch(`${API_BASE}/settings/payments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره تنظیمات پرداخت");
  return data as PaymentSettings;
}
