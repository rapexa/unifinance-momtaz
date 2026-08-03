import { billingModeLabel, parseBillingMode } from "@/components/students/enrollmentBillingUtils";

export function formatCentsToToman(cents: number): string {
  return Math.floor((cents || 0) / 10).toLocaleString("fa-IR");
}

export function monthName(month: number): string {
  const names = [
    "",
    "ژانویه",
    "فوریه",
    "مارس",
    "آوریل",
    "مه",
    "ژوئن",
    "ژوئیه",
    "اوت",
    "سپتامبر",
    "اکتبر",
    "نوامبر",
    "دسامبر",
  ];
  return names[month] ?? String(month);
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
