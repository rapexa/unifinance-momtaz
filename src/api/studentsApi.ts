import {API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

export type RegistrationChannel = "PRIVATE" | "SCHOOL";

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
  registration_channel?: RegistrationChannel | string;
  school_contract_id?: number;
  school_contract_name?: string;
  delivery_mode?: "ONLINE" | "IN_PERSON" | string;
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
  /** مانده ماه: بدهی تا پایان ماه جاری (از تاریخ ثبت‌نام) − پرداخت‌شده؛ منفی = پیش‌پرداخت */
  month_remaining_cents?: number;
  /** مانده کل: کل قرارداد − پرداخت‌شده (ماهانه: شهریه ماه‌های گذشته تا امروز − پرداخت‌شده) */
  total_remaining_cents?: number;
  /** مبلغی که تا پایان ماه جاری باید پرداخت شده باشد */
  due_to_date_cents?: number;
  /** قسط / شهریه همین ماه */
  installment_cents?: number;
  months_elapsed?: number;
  schedule_months?: number;
  /** YYYY-MM-DD — تاریخ پایان (غیرفعال شدن) */
  end_date?: string;
  enrollment_amount_cents?: number;
  /** YYYY-MM-DD — تاریخ شروع مشاوره */
  advisory_start_date?: string;
  role_payouts?: StudentRolePayoutApi[];
  /** هشدارهای نرم محصول (مثلاً عدم تطابق جمع ثبت‌نامی با قرارداد مدرسه) */
  warnings?: string[];
}

export type AdvisorCommissionKind =
  | "NONE"
  | "PERCENT"
  | "FIXED_PER_PAYMENT"
  | "PERCENT_OF_CONTRACT"
  | "FIXED_MONTHLY";

export type EnrollmentBillingMode = "SINGLE_SESSION" | "MONTHLY" | "SCHOOL_ENROLLMENT";

export type DeliveryMode = "ONLINE" | "IN_PERSON";

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

export type StudentStatusFilter = "ACTIVE" | "INACTIVE" | "DELETED";
export type StudentSort = "newest" | "oldest" | "name" | "name_desc";

export interface ListStudentsParams {
  search?: string;
  page?: number;
  page_size?: number;
  /** خالی = همه وضعیت‌ها */
  status?: StudentStatusFilter;
  advisor_id?: number;
  billing_mode?: EnrollmentBillingMode;
  school_name?: string;
  registration_channel?: RegistrationChannel;
  school_contract_id?: number;
  plan_id?: number;
  /** کاربری که سهم نقش برای دانش‌آموز دارد */
  role_user_id?: number;
  has_debt?: boolean;
  sort?: StudentSort;
}

/** حداکثر page_size که بک‌اند می‌پذیرد */
export const MAX_STUDENT_PAGE_SIZE = 200;

export async function listStudents(
  params: ListStudentsParams
): Promise<PaginatedStudentsResponse> {
  const url = new URL(`${API_BASE}/students`);
  const page = params.page ?? 1;
  const pageSize = Math.min(params.page_size ?? 50, MAX_STUDENT_PAGE_SIZE);
  url.searchParams.set("page", String(page));
  url.searchParams.set("page_size", String(pageSize));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.advisor_id != null) url.searchParams.set("advisor_id", String(params.advisor_id));
  if (params.billing_mode) url.searchParams.set("billing_mode", params.billing_mode);
  if (params.school_name) url.searchParams.set("school_name", params.school_name);
  if (params.registration_channel)
    url.searchParams.set("registration_channel", params.registration_channel);
  if (params.school_contract_id != null)
    url.searchParams.set("school_contract_id", String(params.school_contract_id));
  if (params.plan_id != null) url.searchParams.set("plan_id", String(params.plan_id));
  if (params.role_user_id != null) url.searchParams.set("role_user_id", String(params.role_user_id));
  if (params.has_debt) url.searchParams.set("has_debt", "true");
  if (params.sort) url.searchParams.set("sort", params.sort);

  const res = await authFetch(url.toString(), {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت لیست دانش‌آموزان", res);
  }

  return data as PaginatedStudentsResponse;
}

/**
 * همه صفحات را با فیلترهای داده‌شده می‌خواند (برای خروجی اکسل).
 * سقف ۱۰۰ صفحه برای جلوگیری از حلقه بی‌پایان.
 */
export async function listAllStudents(
  params: Omit<ListStudentsParams, "page" | "page_size">
): Promise<StudentApi[]> {
  const out: StudentApi[] = [];
  for (let page = 1; page <= 100; page++) {
    const res = await listStudents({ ...params, page, page_size: MAX_STUDENT_PAGE_SIZE });
    const rows = res.data ?? [];
    out.push(...rows);
    const totalPages = res.meta?.total_pages ?? 1;
    if (rows.length === 0 || page >= totalPages) break;
  }
  return out;
}

/** نام مدارس ثبت‌شده (برای فیلتر) */
export async function listStudentSchools(): Promise<string[]> {
  const res = await authFetch(`${API_BASE}/students/schools`, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت فهرست مدارس", res);
  }
  return ((data as { data?: string[] })?.data ?? []) as string[];
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
  registration_channel?: RegistrationChannel;
  school_contract_id?: number;
  delivery_mode?: DeliveryMode;
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
    apiFail(data, "ثبت دانش‌آموز جدید با خطا مواجه شد", res);
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
    apiFail(data, "خطا در دریافت خلاصه دانش‌آموزان", res);
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
    apiFail(data, "خطا در دریافت اطلاعات دانش‌آموز", res);
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
  registration_channel?: RegistrationChannel;
  school_contract_id?: number;
  delivery_mode?: DeliveryMode;
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
    apiFail(data, "خطا در بروزرسانی دانش‌آموز", res);
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
    apiFail(data, "خطا در حذف دانش‌آموز", res);
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
    apiFail(data, "خطا در حذف کامل دانش‌آموز", res);
  }
}

