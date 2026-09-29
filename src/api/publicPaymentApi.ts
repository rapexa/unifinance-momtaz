import {API_BASE, apiFail} from "./apiClient";
import type { PublicBankAccount } from "./bankAccountsApi";

export interface PublicPayment {
  id: number;
  student_name: string;
  student_phone: string;
  amount_cents: number;
  description: string;
  status: "PENDING" | "PAID" | "OVERDUE" | "CANCELLED";
  due_date: string | null;
  bank_accounts?: PublicBankAccount[];
}

export async function getPublicPayment(id: number | string): Promise<PublicPayment> {
  const res = await fetch(`${API_BASE}/public/payments/${id}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    apiFail(body, "خطا در دریافت اطلاعات پرداخت", res);
  }
  return res.json();
}

export async function initiatePayment(id: number | string): Promise<{ payment_url: string }> {
  const res = await fetch(`${API_BASE}/public/payments/${id}/pay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    apiFail(body, "خطا در اتصال به درگاه پرداخت", res);
  }
  return res.json();
}
