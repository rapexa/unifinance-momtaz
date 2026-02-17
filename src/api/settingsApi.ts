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

// --- Organization (General / CMS) ---
export interface OrganizationSettings {
  id: number;
  name: string;
  phone: string;
  address: string;
  email: string;
}

export async function getOrganization(): Promise<OrganizationSettings> {
  const res = await fetch(`${API_BASE}/settings/organization`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت تنظیمات سازمان");
  return data as OrganizationSettings;
}

export async function updateOrganization(payload: Partial<OrganizationSettings>): Promise<OrganizationSettings> {
  const res = await fetch(`${API_BASE}/settings/organization`, {
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
  const res = await fetch(`${API_BASE}/settings/profile`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت پروفایل");
  return data as Profile;
}

export async function updateProfile(payload: Partial<Profile>): Promise<Profile> {
  const res = await fetch(`${API_BASE}/settings/profile`, {
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
  const base = (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) || "http://localhost:8081/api/v1";
  return base.replace(/\/api\/v1\/?$/, "") || "http://localhost:8081";
}

export async function uploadProfileAvatar(file: File): Promise<Profile> {
  const formData = new FormData();
  formData.append("avatar", file);
  const res = await fetch(`${API_BASE}/settings/profile/avatar`, {
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
  const res = await fetch(`${API_BASE}/settings/security/password`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ current_password, new_password }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در تغییر رمز عبور");
}

export async function toggle2FA(enabled: boolean): Promise<void> {
  const res = await fetch(`${API_BASE}/settings/security/2fa`, {
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
  const res = await fetch(`${API_BASE}/settings/notifications/count`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return 0;
  return (data as { count?: number })?.count ?? 0;
}

export async function getNotifications(): Promise<NotificationSettingItem[]> {
  const res = await fetch(`${API_BASE}/settings/notifications`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت تنظیمات اعلان‌ها");
  return data as NotificationSettingItem[];
}

export async function updateNotifications(settings: NotificationSettingItem[]): Promise<void> {
  const res = await fetch(`${API_BASE}/settings/notifications`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ settings }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره اعلان‌ها");
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
  const res = await fetch(`${API_BASE}/settings/payments`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت تنظیمات پرداخت");
  return data as PaymentSettings;
}

export async function updatePaymentSettings(payload: Partial<PaymentSettings>): Promise<PaymentSettings> {
  const res = await fetch(`${API_BASE}/settings/payments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره تنظیمات پرداخت");
  return data as PaymentSettings;
}
