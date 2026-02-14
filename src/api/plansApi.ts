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
  features?: string[];
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

export interface PlanSummary {
  total_plans: number;
  active_plans: number;
  active_enrollments: number;
  monthly_revenue_cents: number;
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

export interface ListPlansParams {
  search?: string;
  status?: string;
  type?: string;
  page?: number;
  page_size?: number;
}

export async function listPlans(
  params: ListPlansParams,
): Promise<PaginatedPlansResponse> {
  const url = new URL(`${API_BASE}/plans`);
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.type) url.searchParams.set("type", params.type);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.page_size ?? 50));

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

  return data as PaginatedPlansResponse;
}

export async function getPlansSummary(): Promise<PlanSummary> {
  const res = await fetch(`${API_BASE}/plans/summary`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در دریافت خلاصه پلن‌ها";
    throw new Error(message);
  }

  return data as PlanSummary;
}

export interface CreatePlanPayload {
  name: string;
  price_cents: number;
  interval: "monthly" | "yearly";
  type?: string;
  is_active?: boolean;
  max_users?: number;
  features?: string[];
}

export async function createPlan(
  payload: CreatePlanPayload,
): Promise<PlanApi> {
  const res = await fetch(`${API_BASE}/plans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      name: payload.name,
      description: "",
      price_cents: payload.price_cents,
      interval: payload.interval,
      type: payload.type,
      is_active: payload.is_active,
      max_users: payload.max_users,
      features: payload.features ?? [],
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "ثبت پلن جدید با خطا مواجه شد";
    throw new Error(message);
  }

  return data as PlanApi;
}

export interface UpdatePlanPayload {
  name?: string;
  price_cents?: number;
  interval?: "monthly" | "yearly";
  type?: string;
  is_active?: boolean;
  max_users?: number;
  features?: string[];
}

export async function updatePlan(
  id: number,
  payload: UpdatePlanPayload,
): Promise<PlanApi> {
  const res = await fetch(`${API_BASE}/plans/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({
      name: payload.name,
      price_cents: payload.price_cents,
      interval: payload.interval,
      type: payload.type,
      is_active: payload.is_active,
      max_users: payload.max_users,
      features: payload.features,
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "ویرایش پلن با خطا مواجه شد";
    throw new Error(message);
  }

  return data as PlanApi;
}

export async function deactivatePlan(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/plans/${id}`, {
    method: "DELETE",
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message =
      data?.error || "غیرفعال کردن پلن با خطا مواجه شد";
    throw new Error(message);
  }
}

