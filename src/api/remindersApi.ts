import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

export interface ReminderRuleApi {
  type: "BEFORE_DUE" | "DUE_DAY" | "OVERDUE" | "PAYROLL_PENDING";
  days_offset: number;
  body_id: number;
  label: string;
}

export interface ReminderLogApi {
  id: number;
  student_id: number;
  student: string;
  type: "BEFORE_DUE" | "DUE_DAY" | "OVERDUE" | "PAYROLL_PENDING";
  days_offset: number;
  amount_cents: number;
  last_sent: string | null;
  status: "SENT" | "PENDING" | "FAILED";
}

export interface PayrollDueApi {
  entry_id: number;
  user_id: number;
  user_name: string;
  user_phone?: string;
  period_year: number;
  period_month: number;
  total_salary_cents: number;
  status: string;
  payday_day: number;
  days_until_payday: number;
  near_payday: boolean;
  reminder_sent_at?: string | null;
}

export interface PayrollReminderLogApi {
  id: number;
  user_id: number;
  user_name: string;
  period_year: number;
  period_month: number;
  total_salary_cents: number;
  days_before_payday: number;
  status: "SENT" | "PENDING" | "FAILED";
  channel: "TELEGRAM" | "SMS";
  sent_at: string | null;
}

export async function listReminderRules(): Promise<ReminderRuleApi[]> {
  const res = await authFetch(`${API_BASE}/reminders/rules`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت قوانین یادآوری");
  return (data?.data ?? []) as ReminderRuleApi[];
}

export async function listReminderLogs(search?: string): Promise<ReminderLogApi[]> {
  const url = new URL(`${API_BASE}/reminders/logs`);
  if (search) url.searchParams.set("search", search);
  const res = await authFetch(url.toString(), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت لاگ یادآوری");
  return (data?.data ?? []) as ReminderLogApi[];
}

export async function runRemindersNow(): Promise<number> {
  const res = await authFetch(`${API_BASE}/reminders/run`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در اجرای ارسال یادآور");
  return data?.sent_count ?? 0;
}

export async function listPayrollDue(): Promise<{ payday_day: number; data: PayrollDueApi[] }> {
  const res = await authFetch(`${API_BASE}/reminders/payroll-due`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت فیش‌های در انتظار حقوق");
  return {
    payday_day: data?.payday_day ?? 25,
    data: (data?.data ?? []) as PayrollDueApi[],
  };
}

export async function listPayrollReminderLogs(): Promise<PayrollReminderLogApi[]> {
  const res = await authFetch(`${API_BASE}/reminders/payroll-logs`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت لاگ یادآوری حقوق");
  return (data?.data ?? []) as PayrollReminderLogApi[];
}

export async function updatePaydayDay(payday_day: number): Promise<number> {
  const res = await authFetch(`${API_BASE}/reminders/payday`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ payday_day }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره روز پرداخت حقوق");
  return data?.payday_day ?? payday_day;
}
