import {API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

export interface PaymentApi {
  id: number;
  student_id?: number | null;
  student_name: string;
  student_phone?: string;
  advisor_name?: string;
  school_contract_id?: number | null;
  school_name?: string;
  contract_student_count?: number;
  per_student_amount_cents?: number;
  /** STUDENT | LEGACY_SCHOOL (historical contract-only) */
  payer_type?: string;
  is_legacy_school_contract?: boolean;
  enrollment_id?: number;
  plan_name?: string;
  amount_cents: number;
  advisor_share_cents?: number;
  currency: string;
  status: string;
  method: string;
  payment_type: string;
  due_date: string | null;
  paid_at: string | null;
  created_at: string;
  description?: string;
  reference_code?: string;
  bank_account_id?: number | null;
  bank_account_title?: string;
}

export interface PaymentsSummary {
  today_received_cents: number;
  pending_cents: number;
  overdue_cents: number;
  this_month_received_cents: number;
}

export interface PaginatedPaymentsResponse {
  data: PaymentApi[];
  meta: {
    current_page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

export interface ListPaymentsParams {
  page?: number;
  page_size?: number;
  search?: string;
  status?: string;
  method?: string;
  from_date?: string; // YYYY-MM-DD
  to_date?: string;
  sort?: string;
}

export async function listPayments(
  params: ListPaymentsParams = {}
): Promise<PaginatedPaymentsResponse> {
  const url = new URL(`${API_BASE}/payments`);
  url.searchParams.set("page", String(params.page ?? 1));
  url.searchParams.set("page_size", String(params.page_size ?? 20));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.method) url.searchParams.set("method", params.method);
  if (params.from_date) url.searchParams.set("from_date", params.from_date);
  if (params.to_date) url.searchParams.set("to_date", params.to_date);
  if (params.sort) url.searchParams.set("sort", params.sort);

  const res = await authFetch(url.toString(), {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت لیست پرداخت‌ها", res);
  }
  return data as PaginatedPaymentsResponse;
}

export async function getPaymentsSummary(): Promise<PaymentsSummary> {
  const res = await authFetch(`${API_BASE}/payments/summary`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در دریافت خلاصه پرداخت‌ها", res);
  }
  return data as PaymentsSummary;
}

export interface CreatePaymentPayload {
  student_id: number;
  /** @deprecated create with school_contract_id only is rejected by API */
  school_contract_id?: number;
  amount_cents: number;
  method: string;
  status: string;
  payment_type?: "SINGLE_SESSION" | "MONTHLY" | "COURSE";
  description?: string;
  reference_number?: string;
  enrollment_id?: number;
  due_date?: string; // YYYY-MM-DD or ISO
  paid_at?: string;
  currency?: string;
  /** حسابی که پول به آن واریز شده */
  bank_account_id?: number;
}

export async function getPayment(id: number): Promise<PaymentApi> {
  const res = await authFetch(`${API_BASE}/payments/${id}`, {
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 404) throw new Error("پرداخت یافت نشد");
    apiFail(data, "خطا در دریافت پرداخت", res);
  }
  return data as PaymentApi;
}

/** Sends YYYY-MM-DD to the API (never append time or pass jalali strings). */
function toApiDate(date: string | null | undefined): string | undefined {
  if (date == null || String(date).trim() === "") return undefined;
  const s = String(date).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (s.includes("T")) {
    const day = s.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  }
  return undefined;
}

export async function createPayment(
  payload: CreatePaymentPayload
): Promise<PaymentApi> {
  const normalized = {
    ...payload,
    due_date: toApiDate(payload.due_date),
    paid_at: toApiDate(payload.paid_at),
  };
  const res = await authFetch(`${API_BASE}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(normalized),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "ثبت پرداخت با خطا مواجه شد", res);
  }
  return data as PaymentApi;
}

export interface UpdatePaymentPayload {
  amount_cents?: number;
  method?: string;
  status?: string;
  payment_type?: "SINGLE_SESSION" | "MONTHLY" | "COURSE";
  description?: string;
  reference_number?: string;
  due_date?: string | null;
  paid_at?: string | null;
  enrollment_id?: number | null;
  /** 0 = حذف حساب */
  bank_account_id?: number;
}

export async function updatePayment(
  id: number,
  payload: UpdatePaymentPayload
): Promise<PaymentApi> {
  const body: Record<string, unknown> = {};
  if (payload.amount_cents != null) body.amount_cents = payload.amount_cents;
  if (payload.method != null) body.method = payload.method;
  if (payload.status != null) body.status = payload.status;
  if (payload.payment_type != null) body.payment_type = payload.payment_type;
  if (payload.description != null) body.description = payload.description;
  if (payload.reference_number != null) body.reference_number = payload.reference_number;
  if (payload.due_date !== undefined) body.due_date = toApiDate(payload.due_date) ?? null;
  if (payload.paid_at !== undefined) body.paid_at = toApiDate(payload.paid_at) ?? null;
  if (payload.enrollment_id !== undefined) body.enrollment_id = payload.enrollment_id ?? null;
  if (payload.bank_account_id !== undefined) body.bank_account_id = payload.bank_account_id;

  const res = await authFetch(`${API_BASE}/payments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 404) throw new Error("پرداخت یافت نشد");
    apiFail(data, "ویرایش پرداخت با خطا مواجه شد", res);
  }
  return data as PaymentApi;
}

export interface PaymentLinkResponse {
  payment_link: string;
  expires_at: string;
  qr_code_url?: string;
}

export async function generatePaymentLink(
  paymentId: number
): Promise<PaymentLinkResponse> {
  const res = await authFetch(`${API_BASE}/payments/${paymentId}/link`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    apiFail(data, "خطا در ایجاد لینک پرداخت", res);
  }
  return data as PaymentLinkResponse;
}

/** Export payments as CSV; returns blob and suggested filename. */
export async function exportPayments(
  params: Omit<ListPaymentsParams, "page" | "page_size"> & {
    page_size?: number;
  } = {}
): Promise<{ blob: Blob; filename: string }> {
  const url = new URL(`${API_BASE}/payments/export`);
  url.searchParams.set("page", "1");
  url.searchParams.set("page_size", String(params.page_size ?? 10000));
  if (params.search) url.searchParams.set("search", params.search);
  if (params.status) url.searchParams.set("status", params.status);
  if (params.method) url.searchParams.set("method", params.method ?? "");
  if (params.from_date) url.searchParams.set("from_date", params.from_date);
  if (params.to_date) url.searchParams.set("to_date", params.to_date ?? "");
  if (params.sort) url.searchParams.set("sort", params.sort ?? "-created_at");

  const res = await authFetch(url.toString(), {
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    apiFail(data, "خطا در خروجی گرفتن از پرداخت‌ها", res);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition");
  let filename = "payments_export.csv";
  if (disposition) {
    const match = /filename=(.+?)(?:;|$)/i.exec(disposition);
    if (match) filename = match[1].trim().replace(/^["']|["']$/g, "");
  }
  return { blob, filename };
}
