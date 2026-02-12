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

export interface PlanApi {
  id: number;
  name: string;
  price_cents: number;
  type?: string;
  is_active: boolean;
}

export interface PaginatedPlansResponse {
  data: PlanApi[];
  meta: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export async function listActivePlans(): Promise<PlanApi[]> {
  const url = new URL(`${API_BASE}/plans`);
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
      (data && data.error) || "خطا در دریافت لیست پلن‌ها";
    throw new Error(message);
  }

  const typed = data as PaginatedPlansResponse;
  return typed.data ?? [];
}

