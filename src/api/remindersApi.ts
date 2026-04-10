import { API_BASE, authFetch, getAuthHeaders } from "./apiClient";

export interface ReminderRuleApi {
  id: number;
  type: "BEFORE_DUE" | "DUE_DAY" | "OVERDUE";
  days_offset: number;
  channel: "TELEGRAM" | "SMS";
  enabled: boolean;
}

export interface ReminderLogApi {
  id: number;
  student_id: number;
  student: string;
  type: "BEFORE_DUE" | "DUE_DAY" | "OVERDUE";
  days_offset: number;
  amount_cents: number;
  last_sent: string | null;
  status: "SENT" | "PENDING" | "FAILED";
  channel: "TELEGRAM" | "SMS";
}

export async function listReminderRules(): Promise<ReminderRuleApi[]> {
  const res = await authFetch(`${API_BASE}/reminders/rules`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت قوانین یادآوری");
  return (data?.data ?? []) as ReminderRuleApi[];
}

export async function saveReminderRules(rules: Omit<ReminderRuleApi, "id">[]): Promise<void> {
  const res = await authFetch(`${API_BASE}/reminders/rules`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(rules),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در ذخیره قوانین یادآوری");
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

