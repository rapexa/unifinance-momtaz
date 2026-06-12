import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

export interface UserApi {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role_id: number;
  role_code: string;
  role_name: string;
  /** Same as role_code */
  role: string;
  is_active: boolean;
  created_at?: string;
  permissions?: string[];
  /** دانش‌آموزانی که مشاور یا سهم نقش برایشان ثبت شده */
  assigned_students_count?: number;
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
  url.searchParams.set("role_code", "advisor");
  url.searchParams.set("status", "active");
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", "100");

  const res = await authFetch(url.toString(), {
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

export interface RoleCountRow {
  role_id: number;
  code: string;
  name: string;
  count: number;
  students_count?: number;
}

export interface UsersSummary {
  by_role: RoleCountRow[];
}

export interface ListUsersParams {
  search?: string;
  /** Legacy: numeric role_id or role code */
  role?: string;
  role_id?: number;
  role_code?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export async function getUsersSummary(): Promise<UsersSummary> {
  const res = await authFetch(`${API_BASE}/users/summary`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در دریافت خلاصه کاربران";
    throw new Error(message);
  }

  const typed = data as UsersSummary & { by_role?: RoleCountRow[] };
  return { by_role: Array.isArray(typed?.by_role) ? typed.by_role : [] };
}

export async function listUsers(
  params: ListUsersParams,
): Promise<PaginatedUsersResponse> {
  const url = new URL(`${API_BASE}/users`);
  if (params.search) url.searchParams.set("search", params.search);
  if (params.role_id != null) url.searchParams.set("role_id", String(params.role_id));
  else if (params.role_code) url.searchParams.set("role_code", params.role_code);
  else if (params.role) url.searchParams.set("role", params.role);
  if (params.status) url.searchParams.set("status", params.status);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.page_size ?? 50));

  const res = await authFetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در دریافت لیست کاربران";
    throw new Error(message);
  }

  return data as PaginatedUsersResponse;
}

export async function getUser(id: number): Promise<UserApi> {
  const res = await authFetch(`${API_BASE}/users/${id}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در دریافت اطلاعات کاربر";
    throw new Error(message);
  }

  return data as UserApi;
}

export interface UpdateUserPayload {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role_id?: number;
  is_active?: boolean;
  password?: string;
  permissions?: string[];
}

export async function updateUser(
  id: number,
  payload: UpdateUserPayload,
): Promise<UserApi> {
  const res = await authFetch(`${API_BASE}/users/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در بروزرسانی کاربر";
    throw new Error(message);
  }

  return data as UserApi;
}

export async function deactivateUser(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/users/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در غیرفعال کردن کاربر";
    throw new Error(message);
  }
}

export interface CreateUserPayload {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role_id: number;
  password: string;
  is_active?: boolean;
}

export async function createUser(
  payload: CreateUserPayload,
): Promise<UserApi> {
  const res = await authFetch(`${API_BASE}/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "ثبت کاربر جدید با خطا مواجه شد";
    throw new Error(message);
  }

  return data as UserApi;
}

export async function exportUsers(params: {
  search?: string;
  role?: string;
  role_id?: number;
  role_code?: string;
  status?: string;
}): Promise<Blob> {
  const url = new URL(`${API_BASE}/users/export`);
  if (params.search) url.searchParams.set("search", params.search);
  if (params.role_id != null) url.searchParams.set("role_id", String(params.role_id));
  else if (params.role_code) url.searchParams.set("role_code", params.role_code);
  else if (params.role) url.searchParams.set("role", params.role);
  if (params.status) url.searchParams.set("status", params.status);

  const res = await authFetch(url.toString(), {
    headers: {
      ...getAuthHeaders(),
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message =
      data?.error || "خروجی گرفتن از کاربران با خطا مواجه شد";
    throw new Error(message);
  }

  return await res.blob();
}

