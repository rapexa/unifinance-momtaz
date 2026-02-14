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

export interface StudentApi {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  status: string;
  father_phone?: string;
  mother_phone?: string;
  school_name?: string;
  school_address?: string;
  home_address?: string;
  advisor_id?: number;
  advisor_name?: string;
  current_plan_id?: number;
  current_plan_name?: string;
  balance_cents?: number;
}

export interface StudentsSummary {
  total: number;
  active: number;
  inactive: number;
  debtors: number;
}

export interface PaginatedStudentsResponse {
  data: StudentApi[];
  meta: {
    page?: number;
    current_page?: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface ListStudentsParams {
  search?: string;
  page?: number;
  page_size?: number;
}

export async function listStudents(
  params: ListStudentsParams
): Promise<PaginatedStudentsResponse> {
  const url = new URL(`${API_BASE}/students`);
  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 50;
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  if (params.search) {
    url.searchParams.set("search", params.search);
  }

  const res = await fetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) ||
      (res.status === 401
        ? "احراز هویت نامعتبر است"
        : "خطا در دریافت لیست دانش‌آموزان");
    throw new Error(message);
  }

  return data as PaginatedStudentsResponse;
}

export interface CreateStudentPayload {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  father_phone?: string;
  mother_phone?: string;
  school_name?: string;
  school_address?: string;
  home_address?: string;
  advisor_id?: number;
  current_plan_id?: number;
  balance_cents?: number;
}

export async function createStudent(
  payload: CreateStudentPayload
): Promise<StudentApi> {
  const res = await fetch(`${API_BASE}/students`, {
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
      (data && data.error) || "ثبت دانش‌آموز جدید با خطا مواجه شد";
    throw new Error(message);
  }

  return data as StudentApi;
}

export async function getStudentsSummary(): Promise<StudentsSummary> {
  const res = await fetch(`${API_BASE}/students/summary`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در دریافت خلاصه دانش‌آموزان";
    throw new Error(message);
  }

  return data as StudentsSummary;
}

export async function getStudent(id: number): Promise<StudentApi> {
  const res = await fetch(`${API_BASE}/students/${id}`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (data && data.error) || "خطا در دریافت اطلاعات دانش‌آموز";
    throw new Error(message);
  }

  return data as StudentApi;
}

export interface UpdateStudentPayload {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  father_phone?: string;
  mother_phone?: string;
  school_name?: string;
  school_address?: string;
  home_address?: string;
  status?: "ACTIVE" | "INACTIVE";
  advisor_id?: number | null;
  current_plan_id?: number | null;
  balance_cents?: number;
}

export async function updateStudent(
  id: number,
  payload: UpdateStudentPayload
): Promise<StudentApi> {
  const res = await fetch(`${API_BASE}/students/${id}`, {
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
      (data && data.error) || "خطا در بروزرسانی دانش‌آموز";
    throw new Error(message);
  }

  return data as StudentApi;
}

export async function deleteStudent(id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/students/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message =
      (data && data.error) || "خطا در حذف دانش‌آموز";
    throw new Error(message);
  }
}

