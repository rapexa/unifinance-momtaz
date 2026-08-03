/** Payslip / KPI student count semantics from payroll API. */
export type StudentsCountScope = "ORG_TOTAL" | "ASSIGNED";

export function studentsCountLabel(scope?: StudentsCountScope | string | null): string {
  return scope === "ORG_TOTAL" ? "کل دانش‌آموزان" : "دانش‌آموزان منتسب";
}

export function studentsCountTooltip(scope?: StudentsCountScope | string | null): string {
  if (scope === "ORG_TOTAL") {
    return "تعداد همه دانش‌آموزان فعال مرکز (خصوصی و مدرسه‌ای). روی مبلغ حقوق اثر ندارد.";
  }
  return "تعداد دانش‌آموزان فعالی که این کاربر مشاور آن‌هاست یا در سهم نقش‌شان ثبت شده. روی مبلغ حقوق اثر ندارد.";
}
