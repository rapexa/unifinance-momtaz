import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

export interface StudentApi {
  id: number;
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  status: string;
  father_name?: string;
  mother_name?: string;
  father_phone?: string;
  mother_phone?: string;
  father_job?: string;
  mother_job?: string;
  school_name?: string;
  school_address?: string;
  home_address?: string;
  advisor_id?: number;
  advisor_name?: string;
  advisor_commission_kind?: string;
  advisor_commission_percent?: number;
  advisor_commission_fixed_cents?: number;
  enrollment_billing_mode?: "SINGLE_SESSION" | "MONTHLY" | "SCHOOL_ENROLLMENT";
  advisor_accrual_months?: number;
  /** Bitmask: Jalali months 1–12 (bit0=Farvardin) */
  advisor_accrual_month_mask?: number;
  /** پیش‌نمایش سهم ماهانه مشاور (ریال) — ثبت‌نام مدرسه‌ای */
  advisor_monthly_accrual_cents?: number;
  current_plan_id?: number;
  current_plan_name?: string;
  balance_cents?: number;
  /** مانده واقعی: ثبت‌نامی − پرداخت‌شده، یا جمع قبوض باز */
  remaining_balance_cents?: number;
  /** جمع پرداخت‌های وضعیت PAID (ریال×۱۰) */
  paid_total_cents?: number;
  enrollment_amount_cents?: number;
  /** YYYY-MM-DD — تاریخ شروع مشاوره */
  advisory_start_date?: string;
  role_payouts?: StudentRolePayoutApi[];
}

export type AdvisorCommissionKind =
  | "NONE"
  | "PERCENT"
  | "FIXED_PER_PAYMENT"
  | "PERCENT_OF_CONTRACT"
  | "FIXED_MONTHLY";

export type EnrollmentBillingMode = "SINGLE_SESSION" | "MONTHLY" | "SCHOOL_ENROLLMENT";

export interface StudentRolePayoutApi {
  id: number;
  role_id: number;
  role_name?: string;
  user_id: number;
  user_name?: string;
  amount_kind: "PERCENT" | "FIXED_PER_PAYMENT";
  percent?: number;
  fixed_cents?: number;
}

export interface StudentsSummary {
  total: number;
  active: number;
  inactive: number;
  deleted: number;
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

  const res = await authFetch(url.toString(), {
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
  father_name?: string;
  mother_name?: string;
  father_phone?: string;
  mother_phone?: string;
  father_job?: string;
  mother_job?: string;
  school_name?: string;
  school_address?: string;
  home_address?: string;
  advisor_id?: number;
  advisor_commission_kind?: AdvisorCommissionKind;
  advisor_commission_percent?: number;
  advisor_commission_fixed_cents?: number;
  enrollment_billing_mode?: EnrollmentBillingMode;
  advisor_accrual_months?: number;
  advisor_accrual_month_mask?: number;
  current_plan_id?: number;
  enrollment_amount_cents?: number;
  balance_cents?: number;
  advisory_start_date?: string;
  role_payouts?: StudentRolePayoutPayload[];
}

export interface StudentRolePayoutPayload {
  role_id: number;
  user_id: number;
  amount_kind: "PERCENT" | "FIXED_PER_PAYMENT";
  percent?: number;
  fixed_cents?: number;
}

export async function createStudent(
  payload: CreateStudentPayload
): Promise<StudentApi> {
  const res = await authFetch(`${API_BASE}/students`, {
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
  const res = await authFetch(`${API_BASE}/students/summary`, {
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
  const res = await authFetch(`${API_BASE}/students/${id}`, {
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
  father_name?: string;
  mother_name?: string;
  father_phone?: string;
  mother_phone?: string;
  father_job?: string;
  mother_job?: string;
  school_name?: string;
  school_address?: string;
  home_address?: string;
  status?: "ACTIVE" | "INACTIVE" | "DELETED";
  advisor_id?: number | null;
  advisor_commission_kind?: AdvisorCommissionKind;
  advisor_commission_percent?: number;
  advisor_commission_fixed_cents?: number;
  enrollment_billing_mode?: EnrollmentBillingMode;
  advisor_accrual_months?: number;
  advisor_accrual_month_mask?: number;
  current_plan_id?: number | null;
  enrollment_amount_cents?: number;
  balance_cents?: number;
  advisory_start_date?: string;
  role_payouts?: StudentRolePayoutPayload[];
}

export async function updateStudent(
  id: number,
  payload: UpdateStudentPayload
): Promise<StudentApi> {
  const res = await authFetch(`${API_BASE}/students/${id}`, {
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
  const res = await authFetch(`${API_BASE}/students/${id}`, {
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

/** Permanent removal — only for students already marked DELETED. */
export async function purgeStudent(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/students/${id}/permanent`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const message =
      (data && data.error) || "خطا در حذف کامل دانش‌آموز";
    throw new Error(message);
  }
}

