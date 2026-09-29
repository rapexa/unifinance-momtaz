import { API_BASE, authFetch, getAuthHeaders, apiFail } from "./apiClient";

export type LeadStatus = "NEW" | "CONTACTED" | "DEMO" | "WON" | "LOST";

export interface LeadApi {
  id: number;
  name: string;
  phone: string;
  organization?: string;
  city?: string;
  students_range?: string;
  plan?: string;
  hosting?: string;
  message?: string;
  status: LeadStatus;
  note?: string;
  created_at: string;
  updated_at: string;
}

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW: "جدید",
  CONTACTED: "تماس گرفته شد",
  DEMO: "دمو فعال",
  WON: "خرید کرد",
  LOST: "منصرف شد",
};

export async function listLeads(status?: string): Promise<LeadApi[]> {
  const url = new URL(`${API_BASE}/leads`);
  if (status) url.searchParams.set("status", status);
  const res = await authFetch(url.toString(), { headers: getAuthHeaders() });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت درخواست‌ها", res);
  return (data?.data ?? []) as LeadApi[];
}

export async function updateLead(id: number, payload: { status?: LeadStatus; note?: string }): Promise<LeadApi> {
  const res = await authFetch(`${API_BASE}/leads/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...getAuthHeaders() },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در ذخیره", res);
  return data as LeadApi;
}

export async function deleteLead(id: number): Promise<void> {
  const res = await authFetch(`${API_BASE}/leads/${id}`, { method: "DELETE", headers: getAuthHeaders() });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    apiFail(data, "خطا در حذف", res);
  }
}
