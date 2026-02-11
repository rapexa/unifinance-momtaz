export interface LoginSuccess {
  success: true;
  data: any;
}

export interface LoginFailure {
  success: false;
  error: string;
}

export type LoginResult = LoginSuccess | LoginFailure;

const DEFAULT_API_BASE = "http://localhost:8081/api/v1";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL) ||
  DEFAULT_API_BASE;

/**
 * Login with email and password against the backend API.
 * - Sends POST /auth/login
 * - On success, stores tokens in localStorage.
 * - Returns { success, data } or { success, error }.
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
      const status = res.status;
      let message =
        (data && data.error) ||
        (status === 401
          ? "Invalid credentials"
          : status === 403
          ? "Access denied"
          : "Login failed");

      return { success: false, error: message };
    }

    // Expect tokens.access_token / tokens.refresh_token (from current backend)
    const access = data?.tokens?.access_token;
    if (!access) {
      return {
        success: false,
        error: "Invalid response from server",
      };
    }

    // Store tokens for later use
    localStorage.setItem("accessToken", access);
    const refresh = data.tokens?.refresh_token;
    if (refresh) {
      localStorage.setItem("refreshToken", refresh);
    }

    return { success: true, data };
  } catch (err) {
    console.error("login API error", err);
    return {
      success: false,
      error: "Server unreachable. Please try again later.",
    };
  }
}

