/**
 * Shamsi (Jalali) ↔ Gregorian month helpers.
 * Re-exports the shared conversion from jalaliDate so Reports and other callers stay stable.
 */

import {
  JALALI_MONTH_NAMES,
  gregorianYYYYMMToJalaliPeriod,
  jalaliPeriodToGregorianYYYYMM,
  jalaliYearOptions,
} from "@/lib/jalaliDate";

export const SHAMSI_MONTH_NAMES: Record<number, string> = {
  1: JALALI_MONTH_NAMES[0],
  2: JALALI_MONTH_NAMES[1],
  3: JALALI_MONTH_NAMES[2],
  4: JALALI_MONTH_NAMES[3],
  5: JALALI_MONTH_NAMES[4],
  6: JALALI_MONTH_NAMES[5],
  7: JALALI_MONTH_NAMES[6],
  8: JALALI_MONTH_NAMES[7],
  9: JALALI_MONTH_NAMES[8],
  10: JALALI_MONTH_NAMES[9],
  11: JALALI_MONTH_NAMES[10],
  12: JALALI_MONTH_NAMES[11],
};

/** Shamsi (year, month 1–12) → Gregorian YYYY-MM */
export function shamsiToGregorianYYYYMM(sYear: number, sMonth: number): string {
  return jalaliPeriodToGregorianYYYYMM(sYear, sMonth);
}

/** Gregorian YYYY-MM → Shamsi (year, month 1–12) */
export function gregorianYYYYMMToShamsi(ym: string): { year: number; month: number } {
  return gregorianYYYYMMToJalaliPeriod(ym);
}

/** List of Shamsi years for selector (e.g. 1398–1412) */
export function shamsiYearOptions(): number[] {
  return jalaliYearOptions(1398, 1412);
}
