const DEFAULT_API_BASE = "https://api.mali-momtazisho.ir/api/v1";
const API_BASE =
  (typeof import.meta !== "undefined" &&
    (import.meta as any).env?.VITE_API_BASE_URL) ||
  DEFAULT_API_BASE;

function getAuthHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const token = window.localStorage.getItem("accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

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
  const res = await fetch(`${API_BASE}/reminders/rules`, { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت قوانین یادآوری");
  return (data?.data ?? []) as ReminderRuleApi[];
}

export async function saveReminderRules(rules: Omit<ReminderRuleApi, "id">[]): Promise<void> {
  const res = await fetch(`${API_BASE}/reminders/rules`, {
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
  const res = await fetch(url.toString(), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در دریافت لاگ یادآوری");
  return (data?.data ?? []) as ReminderLogApi[];
}

export async function runRemindersNow(): Promise<number> {
  const res = await fetch(`${API_BASE}/reminders/run`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data && data.error) || "خطا در اجرای ارسال یادآور");
  return data?.sent_count ?? 0;
}

