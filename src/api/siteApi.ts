import { API_BASE, apiFail } from "./apiClient";

export interface SiteInfo {
  /** true on the vendor's own site: "/" shows the sales page and the leads inbox is enabled */
  vendor: boolean;
  product_name: string;
  organization_name: string;
}

export async function getSiteInfo(): Promise<SiteInfo> {
  const res = await fetch(`${API_BASE}/public/site`);
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "خطا در دریافت اطلاعات سایت", res);
  return data as SiteInfo;
}

export interface LeadPayload {
  name: string;
  phone: string;
  organization?: string;
  city?: string;
  students_range?: string;
  plan?: string;
  hosting?: string;
  message?: string;
  /** honeypot — must stay empty */
  website?: string;
}

export async function submitLead(payload: LeadPayload): Promise<void> {
  const res = await fetch(`${API_BASE}/public/leads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) apiFail(data, "ثبت درخواست ناموفق بود", res);
}
