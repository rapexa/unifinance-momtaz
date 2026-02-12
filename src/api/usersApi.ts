const DEFAULT_API_BASE = "http://localhost:8081/api/v1";

const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL) ||
  DEFAULT_API_BASE;

function getAuthHeaders() {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface UserApi {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role: string;
  is_active: boolean;
}

export interface PaginatedUsersResponse {
  data: UserApi[];
  meta: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export async function listAdvisors(): Promise<UserApi[]> {
  const url = new URL(`${API_BASE}/users`);
  url.searchParams.set("role", "ADVISOR");
  url.searchParams.set("status", "active");
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "100");

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در دریافت لیست مشاوران";
    throw new Error(message);
  }

  const typed = data as PaginatedUsersResponse;
  return typed.data ?? [];
}

