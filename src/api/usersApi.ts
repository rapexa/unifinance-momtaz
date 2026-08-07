import { API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

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

/** True when the user's RBAC role is an advisor (code/name). */
export function isAdvisorRoleUser(u: Pick<UserApi, "role_code" | "role" | "role_name">): boolean {
  const code = (u.role_code || u.role || "").toLowerCase().trim();
  const name = (u.role_name || "").trim();
  if (code === "advisor") return true;
  if (name === "مشاور") return true;
  // Custom roles that are clearly advisor (exclude lead/manager titles).
  if (name.includes("مشاور") && !name.includes("سرپرست") && !name.includes("مدیر")) return true;
  return false;
}

/** Active users whose RBAC role is مشاور. */
export async function listAdvisors(): Promise<UserApi[]> {
  const byCode = (await listAllUsers({ status: "active", role_code: "advisor" })).filter(
    isAdvisorRoleUser,
  );
  if (byCode.length > 0) return byCode;
  const all = await listAllUsers({ status: "active" });
  return all.filter(isAdvisorRoleUser);
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
    apiFail(data, "خطا در دریافت خلاصه کاربران", res);
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
    apiFail(data, "خطا در دریافت لیست کاربران", res);
  }

  return data as PaginatedUsersResponse;
}

/** حداکثر page_size که بک‌اند برای کاربران می‌پذیرد */
export const MAX_USER_PAGE_SIZE = 500;

/**
 * همه کاربران را با پیمایش صفحات می‌خواند تا هیچ کاربری از فهرست انتخاب مشاور جا نیفتد.
 * سقف ۲۰ صفحه برای جلوگیری از حلقه بی‌پایان.
 */
export async function listAllUsers(
  params: Omit<ListUsersParams, "page" | "page_size"> = {},
): Promise<UserApi[]> {
  const out: UserApi[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await listUsers({ ...params, page, page_size: MAX_USER_PAGE_SIZE });
    const rows = res.data ?? [];
    out.push(...rows);
    const totalPages = res.meta?.total_pages ?? 1;
    if (rows.length === 0 || page >= totalPages) break;
  }
  return out;
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
    apiFail(data, "خطا در دریافت اطلاعات کاربر", res);
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
    apiFail(data, "خطا در بروزرسانی کاربر", res);
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
    apiFail(data, "خطا در غیرفعال کردن کاربر", res);
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
    apiFail(data, "ثبت کاربر جدید با خطا مواجه شد", res);
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
    apiFail(data, "خروجی گرفتن از کاربران با خطا مواجه شد", res);
  }

  return await res.blob();
}

