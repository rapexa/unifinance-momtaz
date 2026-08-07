import { localizeApiError } from "@/lib/apiError";
import { API_BASE } from "./apiClient";

export interface LoginSuccess {
  success: true;
  data: any;
}

export interface LoginFailure {
  success: false;
  error: string;
}

export type LoginResult = LoginSuccess | LoginFailure;

/**
 * Login with email and password against the backend API.
 * - Sends POST /auth/login
 * - On success, stores tokens in localStorage.
 * - Returns { success, data } or { success, error } with Persian messages.
 */
export async function login(
  email: string,
  password: string
): Promise<LoginResult> {
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const raw =
        (data && data.error) ||
        (res.status === 401
          ? "invalid credentials"
          : res.status === 403
            ? "Access denied"
            : "Login failed");
      if (typeof console !== "undefined") {
        console.error("[api] login failed:", res.status, raw);
      }
      return {
        success: false,
        error: localizeApiError(raw, "خطا در ورود. دوباره تلاش کنید."),
      };
    }

    const access = data?.tokens?.access_token;
    if (!access) {
      console.error("[api] login: missing access_token in response");
      return {
        success: false,
        error: "پاسخ سرور نامعتبر است.",
      };
    }

    localStorage.setItem("accessToken", access);
    const refresh = data.tokens?.refresh_token;
    if (refresh) {
      localStorage.setItem("refreshToken", refresh);
    }

    return { success: true, data };
  } catch (err) {
    console.error("[api] login API error", err);
    return {
      success: false,
      error: "خطای اتصال به سرور. لطفاً بعداً دوباره تلاش کنید.",
    };
  }
}
