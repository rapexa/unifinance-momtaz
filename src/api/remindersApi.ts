import {API_BASE, authFetch, getAuthHeaders, apiFail} from "./apiClient";

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
  type: "BEFORE_DUE" | "DUE_DAY" | "OVERDUE" | "PAYROLL_PENDING" | "MANUAL";
  days_offset: number;
  amount_cents: number;
  last_sent: string | null;
  status: "SENT" | "PENDING" | "FAILED";
  template_key?: string;
  message?: string;
  recipients?: string;
  error?: string;
  due_date?: string | null;
}

export interface MessageTemplateApi {
  key: string;
  title: string;
  /** BEFORE_DUE | OVERDUE | MANUAL */
  type: string;
  days_offset: number;
  body: string;
  enabled: boolean;
}

export interface TemplatesResponse {
  data: MessageTemplateApi[];
  /** true = متن دلخواه ارسال می‌شود (شماره خط تنظیم شده) */
  custom_text: boolean;
  sms_configured: boolean;
  placeholders: string[];
}

export interface DebtorApi {
  student_id: number;
  name: string;
  phone?: string;
  father_phone?: string;
  mother_phone?: string;
  advisor_name?: string;
  /** SCHEDULE = از شهریه/اقساط ثبت‌نام | INVOICE = قبوض ثبت‌شده با سررسید */
  source: "SCHEDULE" | "INVOICE";
  overdue_cents: number;
  oldest_due_date?: string | null;
  days_overdue: number;
  next_due_date?: string | null;
  next_due_cents: number;
  days_until_due: number;
  total_remaining_cents: number;
  /** معوق ۱–۳۰، ۳۱–۶۰، بیش از ۶۰ روز */
  aging_cents: [number, number, number];
  last_reminder_at?: string | null;
  last_reminder?: string;
  last_reminder_status?: "SENT" | "FAILED" | "PENDING";
}

export async function listDebtors(days = 30): Promise<DebtorApi[]> {
  const url = new URL(`${API_BASE}/reminders/debtors`);
  url.searchParams.set("days", String(days));
  const res = await authFetch(url.toString(), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت بدهکاران", res);
  return (data?.data ?? []) as DebtorApi[];
}

export async function listMessageTemplates(): Promise<TemplatesResponse> {
  const res = await authFetch(`${API_BASE}/reminders/templates`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت متن پیامک‌ها", res);
  return {
    data: (data?.data ?? []) as MessageTemplateApi[],
    custom_text: !!data?.custom_text,
    sms_configured: !!data?.sms_configured,
    placeholders: data?.placeholders ?? [],
  };
}

export async function updateMessageTemplate(
  key: string,
  payload: { body: string; enabled?: boolean },
): Promise<MessageTemplateApi> {
  const res = await authFetch(`${API_BASE}/reminders/templates/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در ذخیره متن پیامک", res);
  return data as MessageTemplateApi;
}

export async function previewReminder(payload: {
  student_id: number;
  template_key?: string;
  text?: string;
}): Promise<string> {
  const res = await authFetch(`${API_BASE}/reminders/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در پیش‌نمایش پیامک", res);
  return data?.message ?? "";
}

export interface SendReminderResult {
  sent: number;
  failed: number;
  results: { student_id: number; name: string; status: string; error?: string; message?: string }[];
}

export async function sendReminders(payload: { student_ids: number[]; text?: string }): Promise<SendReminderResult> {
  const res = await authFetch(`${API_BASE}/reminders/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در ارسال پیامک", res);
  return data as SendReminderResult;
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
  if (!res.ok) apiFail(data, "خطا در دریافت قوانین یادآوری", res);
  return (data?.data ?? []) as ReminderRuleApi[];
}

export async function listReminderLogs(search?: string): Promise<ReminderLogApi[]> {
  const url = new URL(`${API_BASE}/reminders/logs`);
  if (search) url.searchParams.set("search", search);
  const res = await authFetch(url.toString(), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت لاگ یادآوری", res);
  return (data?.data ?? []) as ReminderLogApi[];
}

export async function runRemindersNow(): Promise<number> {
  const res = await authFetch(`${API_BASE}/reminders/run`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در اجرای ارسال یادآور", res);
  return data?.sent_count ?? 0;
}

export async function listPayrollDue(): Promise<{ payday_day: number; data: PayrollDueApi[] }> {
  const res = await authFetch(`${API_BASE}/reminders/payroll-due`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت فیش‌های در انتظار حقوق", res);
  return {
    payday_day: data?.payday_day ?? 25,
    data: (data?.data ?? []) as PayrollDueApi[],
  };
}

export async function listPayrollReminderLogs(): Promise<PayrollReminderLogApi[]> {
  const res = await authFetch(`${API_BASE}/reminders/payroll-logs`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت لاگ یادآوری حقوق", res);
  return (data?.data ?? []) as PayrollReminderLogApi[];
}

export async function updatePaydayDay(payday_day: number): Promise<number> {
  const res = await authFetch(`${API_BASE}/reminders/payday`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify({ payday_day }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در ذخیره روز پرداخت حقوق", res);
  return data?.payday_day ?? payday_day;
}
