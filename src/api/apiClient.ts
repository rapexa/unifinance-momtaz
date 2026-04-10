const DEFAULT_API_BASE = "https://api.mali-momtazisho.ir/api/v1";

export const API_BASE =
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_API_BASE_URL) ||
  DEFAULT_API_BASE;

export function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

let authRedirectScheduled = false;

function requestUrlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

/**
 * نشست نامعتبر یا منقضی: پاک کردن توکن‌ها و رفتن به صفحهٔ ورود ادمین.
 * برای POST /auth/login اجرا نمی‌شود (رمز اشتباه ≠ نشست منقضی).
 */
export function redirectToAdminLogin(): void {
  if (typeof window === "undefined") return;
  if (authRedirectScheduled) return;
  const path = window.location.pathname;
  if (path === "/login" || path === "/") return;
  authRedirectScheduled = true;
  try {
    window.localStorage.removeItem("accessToken");
    window.localStorage.removeItem("refreshToken");
  } catch {
    /* ignore */
  }
  window.location.assign("/login");
}

/**
 * مانند fetch؛ اگر پاسخ 401 باشد (به‌جز درخواست ورود)، به‌صورت خودکار به /login هدایت می‌شود.
 */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  const url = requestUrlString(input);
  if (url.includes("/auth/login")) return res;
  redirectToAdminLogin();
  return res;
}
