import {API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

export interface SchoolContractApi {
  id: number;
  school_name: string;
  student_count: number;
  /** تعداد دانش‌آموزان ثبت‌شده زیر این قرارداد */
  registered_student_count?: number;
  /** مبلغ هر دانش‌آموز */
  unit_price_cents?: number;
  total_amount_cents: number;
  /** جمع پرداخت‌های PAID دانش‌آموزان همین مدرسه */
  paid_total_cents: number;
  remaining_balance_cents: number;
  /** پرداخت‌های تاریخی فقط‌قراردادی (در paid_total شمرده نمی‌شود) */
  legacy_paid_total_cents?: number;
  /** جمع مبالغ ثبت‌نامی دانش‌آموزان ثبت‌شده */
  students_enrollment_sum_cents?: number;
  /** تعداد دانش‌آموزانی که مانده‌شان صفر/بستانکار است */
  students_settled_count?: number;
  /** تعداد دانش‌آموزان با مانده بدهکار */
  students_debt_count?: number;
  /** جمع ثبت‌نامی‌ها با مبلغ قرارداد برابر نیست (هشدار نرم) */
  enrollment_mismatch?: boolean;
  status: string;
  notes?: string;
  start_date?: string | null;
  end_date?: string | null;
  /** MONTHLY ماهانه | TERM دوره‌ای | ANNUAL سالانه */
  payment_type?: SchoolPaymentType;
  /** برای دوره‌ای: SUMMER تابستان | ACADEMIC مهر تا خرداد */
  term?: SchoolTerm | "";
  duration_months?: number;
  /** مبلغ هر قسط (ماهانه = کل ÷ ماه‌ها) */
  installment_cents?: number;
  created_at: string;
}

export type SchoolPaymentType = "MONTHLY" | "TERM" | "ANNUAL";
export type SchoolTerm = "SUMMER" | "ACADEMIC";

export const SCHOOL_PAYMENT_TYPE_LABELS: Record<SchoolPaymentType, string> = {
  MONTHLY: "ماهانه",
  TERM: "دوره‌ای",
  ANNUAL: "سالانه",
};

export const SCHOOL_TERM_LABELS: Record<SchoolTerm, string> = {
  SUMMER: "دوره تابستان (تیر تا شهریور)",
  ACADEMIC: "دوره تحصیلی (مهر تا خرداد)",
};

export interface PaginatedSchoolContractsResponse {
  data: SchoolContractApi[];
  meta: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface ListSchoolContractsParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  sort?: string;
}

export interface CreateSchoolContractPayload {
  school_name: string;
  student_count: number;
  /** مبلغ کل قرارداد (واحد داخلی API؛ تومان × ۱۰) */
  total_amount_cents: number;
  /** مبلغ هر دانش‌آموز */
  unit_price_cents?: number;
  notes?: string;
  start_date?: string;
  end_date?: string;
  payment_type?: SchoolPaymentType;
  term?: SchoolTerm;
  status?: string;
}

export type UpdateSchoolContractPayload = CreateSchoolContractPayload;

export async function listSchoolContracts(
  params: ListSchoolContractsParams = {},
): Promise<PaginatedSchoolContractsResponse> {
  const url = new URL(`${API_BASE}/school-contracts`);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.page_size ?? 20));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.sort) url.searchParams.set("sort", params.sort);

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت قراردادهای مدرسه", res);
  }
  return data as PaginatedSchoolContractsResponse;
}

export async function listAllSchoolContracts(
  params: Omit<ListSchoolContractsParams, "page" | "page_size"> = {},
): Promise<SchoolContractApi[]> {
  const pageSize = 200;
  let page = 1;
  const all: SchoolContractApi[] = [];
  for (;;) {
    const res = await listSchoolContracts({ ...params, page, page_size: pageSize });
    all.push(...res.data);
    if (page >= (res.meta.total_pages || 1) || res.data.length === 0) break;
    page += 1;
  }
  return all;
}

export async function getSchoolContract(id: number): Promise<SchoolContractApi> {
  const res = await authFetch(`${API_BASE}/school-contracts/${id}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "قرارداد مدرسه یافت نشد", res);
  }
  return data as SchoolContractApi;
}

export async function createSchoolContract(
  payload: CreateSchoolContractPayload,
): Promise<SchoolContractApi> {
  const res = await authFetch(`${API_BASE}/school-contracts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در ثبت قرارداد مدرسه", res);
  }
  return data as SchoolContractApi;
}

export async function updateSchoolContract(
  id: number,
  payload: UpdateSchoolContractPayload,
): Promise<SchoolContractApi> {
  const res = await authFetch(`${API_BASE}/school-contracts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در ویرایش قرارداد مدرسه", res);
  }
  return data as SchoolContractApi;
}

export async function deleteSchoolContract(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/school-contracts/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    apiFail(data, "خطا در حذف قرارداد مدرسه", res);
  }
}
