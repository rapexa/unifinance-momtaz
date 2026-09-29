import { API_BASE, authFetch, getAuthHeaders, apiFail } from "./apiClient";

export interface BankAccountApi {
  id: number;
  title: string;
  bank_name?: string;
  owner_name?: string;
  card_number?: string;
  account_number?: string;
  iban?: string;
  opening_balance_cents: number;
  is_active: boolean;
  show_to_students: boolean;
  sort_order: number;
  notes?: string;
  /** جمع دریافتی‌های پرداخت‌شده به این حساب */
  inflow_cents: number;
  /** جمع پرداخت حقوق و هزینه‌ها از این حساب */
  outflow_cents: number;
  /** موجودی = اولیه + دریافتی − پرداختی */
  balance_cents: number;
  created_at: string;
}

/** Account details shown to students (card-to-card / transfer). */
export interface PublicBankAccount {
  title: string;
  bank_name?: string;
  owner_name?: string;
  card_number?: string;
  account_number?: string;
  iban?: string;
}

export interface BankAccountPayload {
  title: string;
  bank_name?: string;
  owner_name?: string;
  card_number?: string;
  account_number?: string;
  iban?: string;
  opening_balance_cents?: number;
  is_active?: boolean;
  show_to_students?: boolean;
  sort_order?: number;
  notes?: string;
}

export async function listBankAccounts(params?: {
  activeOnly?: boolean;
}): Promise<{ data: BankAccountApi[]; total_balance_cents: number }> {
  const url = new URL(`${API_BASE}/bank-accounts`);
  if (params?.activeOnly) url.searchParams.set("active", "true");
  const res = await authFetch(url.toString(), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت حساب‌های بانکی", res);
  return {
    data: (data?.data ?? []) as BankAccountApi[],
    total_balance_cents: data?.total_balance_cents ?? 0,
  };
}

export async function createBankAccount(payload: BankAccountPayload): Promise<BankAccountApi> {
  const res = await authFetch(`${API_BASE}/bank-accounts`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در ثبت حساب بانکی", res);
  return data as BankAccountApi;
}

export async function updateBankAccount(id: number, payload: BankAccountPayload): Promise<BankAccountApi> {
  const res = await authFetch(`${API_BASE}/bank-accounts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در ویرایش حساب بانکی", res);
  return data as BankAccountApi;
}

export async function deleteBankAccount(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/bank-accounts/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    apiFail(data, "خطا در حذف حساب بانکی", res);
  }
}

/** 6037991234567890 → 6037-9912-3456-7890 */
export function formatCardNumber(card?: string): string {
  const digits = (card ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return digits.replace(/(\d{4})(?=\d)/g, "$1-");
}
