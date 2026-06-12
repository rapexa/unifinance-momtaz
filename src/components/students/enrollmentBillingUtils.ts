import { JALALI_MONTH_NAMES } from "@/lib/jalaliDate";
import type { AdvisorCommissionKind, EnrollmentBillingMode } from "@/api/studentsApi";

export { JALALI_MONTH_NAMES };

export function parseBillingMode(raw: string | undefined): EnrollmentBillingMode {
  if (raw === "SINGLE_SESSION") return "SINGLE_SESSION";
  if (raw === "SCHOOL_ENROLLMENT") return "SCHOOL_ENROLLMENT";
  return "MONTHLY";
}

export function billingModeLabel(mode: EnrollmentBillingMode): string {
  switch (mode) {
    case "SINGLE_SESSION":
      return "تک جلسه‌ای";
    case "SCHOOL_ENROLLMENT":
      return "سالانه (اقساط)";
    default:
      return "ماهانه";
  }
}

export function isPerPaymentBilling(mode: EnrollmentBillingMode): boolean {
  return mode === "MONTHLY" || mode === "SINGLE_SESSION";
}

export function parseCommKind(
  raw: string | undefined,
  billing: EnrollmentBillingMode,
): AdvisorCommissionKind {
  if (raw === "PERCENT_OF_CONTRACT" || raw === "FIXED_MONTHLY") {
    return billing === "SCHOOL_ENROLLMENT" ? raw : "NONE";
  }
  if (raw === "PERCENT" || raw === "FIXED_PER_PAYMENT") {
    return isPerPaymentBilling(billing) ? raw : "NONE";
  }
  return "NONE";
}

export function defaultAccrualMonthMask(monthCount = 10): number {
  let mask = 0;
  for (let jm = 1; jm <= Math.min(12, monthCount); jm++) {
    mask |= 1 << (jm - 1);
  }
  return mask;
}

export function monthsFromMask(mask: number): number[] {
  const out: number[] = [];
  for (let jm = 1; jm <= 12; jm++) {
    if (mask & (1 << (jm - 1))) out.push(jm);
  }
  return out;
}

export function maskFromMonths(months: number[]): number {
  return months.reduce((m, jm) => m | (1 << (jm - 1)), 0);
}

export function accrualMonthCountFromMask(mask: number): number {
  return monthsFromMask(mask).length;
}

export function toggleMonthInMask(mask: number, jm: number, checked: boolean): number {
  if (jm < 1 || jm > 12) return mask;
  if (checked) return mask | (1 << (jm - 1));
  return mask & ~(1 << (jm - 1));
}

export function switchBillingCommKind(
  kind: AdvisorCommissionKind,
  toMode: EnrollmentBillingMode,
): AdvisorCommissionKind {
  if (toMode === "SCHOOL_ENROLLMENT") {
    if (kind === "PERCENT") return "PERCENT_OF_CONTRACT";
    if (kind === "FIXED_PER_PAYMENT") return "FIXED_MONTHLY";
    return kind === "NONE" ? "NONE" : kind;
  }
  if (kind === "PERCENT_OF_CONTRACT") return "PERCENT";
  if (kind === "FIXED_MONTHLY") return "FIXED_PER_PAYMENT";
  return kind === "NONE" ? "NONE" : kind;
}
