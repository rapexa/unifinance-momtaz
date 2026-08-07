import { billingModeLabel, parseBillingMode } from "@/components/students/enrollmentBillingUtils";
import { formatGregorianPeriodJalali, JALALI_MONTH_NAMES } from "@/lib/jalaliDate";

export function formatCentsToToman(cents: number): string {
  return Math.floor((cents || 0) / 10).toLocaleString("fa-IR");
}

/** Jalali month name (1–12 = فروردین…اسفند). Prefer formatPayrollPeriod for API periods. */
export function monthName(month: number): string {
  if (month < 1 || month > 12) return String(month);
  return JALALI_MONTH_NAMES[month - 1] ?? String(month);
}

/** Display a Gregorian payroll period (API year/month) as Jalali. */
export function formatPayrollPeriod(year: number, month: number): string {
  return formatGregorianPeriodJalali(year, month);
}

export function registrationChannelLabel(channel?: string): string {
  if (channel === "SCHOOL") return "مدرسه‌ای";
  if (channel === "PRIVATE" || !channel) return "خصوصی";
  return channel;
}

export function contractTypeLabel(billingMode?: string): string {
  return billingModeLabel(parseBillingMode(billingMode));
}

export const payrollRoleLabels: Record<string, string> = {
  general_manager: "مدیرکل",
  advisor: "مشاور",
  secretary: "منشی",
  support: "پشتیبان",
  executive_manager: "مدیر اجرایی",
  advisor_lead: "سرپرست مشاوران",
  ADMIN: "مدیر",
  ACCOUNTANT: "حسابدار",
  ADVISOR: "مشاور",
  OPERATOR: "اپراتور",
};

export function rbacRoleLabel(roleName?: string, roleCode?: string): string {
  if (roleName?.trim()) return roleName;
  return payrollRoleLabels[roleCode ?? ""] ?? (roleCode || "—");
}
